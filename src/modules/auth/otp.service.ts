import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { hashToken } from '../../common/utils/crypto.util';

export const OTP_TTL_SECONDS = 10 * 60;
const SEND_RATE_WINDOW_SECONDS = 15 * 60;
const VERIFY_RATE_WINDOW_SECONDS = 15 * 60;
const MAX_SEND_ATTEMPTS = 3;
const MAX_VERIFY_ATTEMPTS = 5;

/**
 * When a new code is issued while an older one is still live (duplicate send,
 * double-tap on "resend", a retried request), the older code stays acceptable
 * for this long. Without it the code the user actually read first is silently
 * killed by the newer send and verification appears to reject a valid OTP.
 */
const PREVIOUS_CODE_GRACE_MS = 5 * 60 * 1000;

type StoredEmailOtp = {
  codeHash: string;
  issuedAt: number;
  previousCodeHash?: string;
  previousValidUntil?: number;
};

/**
 * Issue is read-modify-write, so it has to be atomic: two concurrent sends must
 * not both read "no existing code" and clobber each other's record.
 * KEYS[1] otp key | ARGV[1] new code hash | ARGV[2] now (ms)
 * ARGV[3] ttl (seconds) | ARGV[4] grace (ms)
 */
const ISSUE_OTP_SCRIPT = `
local now = tonumber(ARGV[2])
local graceMs = tonumber(ARGV[4])
local ttlMs = tonumber(ARGV[3]) * 1000
local payload = { codeHash = ARGV[1], issuedAt = now }

local existing = redis.call('GET', KEYS[1])
if existing then
  local ok, prev = pcall(cjson.decode, existing)
  if ok and prev and prev.codeHash and prev.codeHash ~= ARGV[1] then
    local graceUntil = now + graceMs
    -- Never let a superseded code outlive its own original TTL.
    local prevIssuedAt = tonumber(prev.issuedAt)
    if prevIssuedAt then
      local ownExpiry = prevIssuedAt + ttlMs
      if ownExpiry < graceUntil then
        graceUntil = ownExpiry
      end
    end
    if graceUntil > now then
      payload.previousCodeHash = prev.codeHash
      payload.previousValidUntil = graceUntil
    end
  end
end

redis.call('SET', KEYS[1], cjson.encode(payload), 'EX', ARGV[3])
return 1
`;

/**
 * KEYS[1] otp key | ARGV[1] candidate code hash | ARGV[2] now (ms)
 * Returns 1 and deletes the record on a match, 0 otherwise.
 */
const CONSUME_OTP_SCRIPT = `
local data = redis.call('GET', KEYS[1])
if not data then return 0 end
local ok, payload = pcall(cjson.decode, data)
if not ok or not payload then return 0 end

if payload.codeHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end

if payload.previousCodeHash == ARGV[1] then
  local validUntil = tonumber(payload.previousValidUntil)
  if validUntil and validUntil > tonumber(ARGV[2]) then
    redis.call('DEL', KEYS[1])
    return 1
  end
end

return 0
`;

@Injectable()
export class OtpService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Reserves a send slot and stores the code hash.
   *
   * Callers MUST store before emailing: if the email goes out first, a
   * concurrent send can win the Redis write and leave the delivered code
   * unverifiable. On delivery failure call {@link releaseSendSlot}.
   */
  async issueEmailOtp(
    institutionId: string,
    email: string,
    code: string,
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    await this.assertCanSend(institutionId, normalizedEmail);

    await this.redisService
      .getClient()
      .eval(
        ISSUE_OTP_SCRIPT,
        1,
        this.buildOtpKey(institutionId, normalizedEmail),
        hashToken(code),
        Date.now().toString(),
        OTP_TTL_SECONDS.toString(),
        PREVIOUS_CODE_GRACE_MS.toString(),
      );
  }

  /**
   * Gives back the send slot consumed by {@link issueEmailOtp} when the code
   * never actually reached the user, so a failed delivery cannot rate-limit
   * them out of their own signup.
   */
  async releaseSendSlot(institutionId: string, email: string): Promise<void> {
    const key = `otp:rate:send:${institutionId}:${email.toLowerCase()}`;
    const remaining = await this.redisService.incrBy(key, -1);

    if (remaining <= 0) {
      await this.redisService.del(key);
    }
  }

  async checkEmailOtp(
    institutionId: string,
    email: string,
    code: string,
  ): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();
    await this.assertCanVerify(institutionId, normalizedEmail);

    const stored = await this.redisService.getJson<StoredEmailOtp>(
      this.buildOtpKey(institutionId, normalizedEmail),
    );

    if (!stored || !this.matchesStoredCode(stored, code)) {
      await this.recordFailedVerify(institutionId, normalizedEmail);
      return false;
    }

    return true;
  }

  async consumeEmailOtp(
    institutionId: string,
    email: string,
    code: string,
  ): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();
    await this.assertCanVerify(institutionId, normalizedEmail);

    const key = this.buildOtpKey(institutionId, normalizedEmail);
    const consumed = await this.redisService
      .getClient()
      .eval(CONSUME_OTP_SCRIPT, 1, key, hashToken(code), Date.now().toString());

    if (consumed !== 1) {
      await this.recordFailedVerify(institutionId, normalizedEmail);
      return false;
    }

    // A successful verification clears the failed-attempt budget.
    await this.redisService.del(
      `otp:rate:verify:${institutionId}:${normalizedEmail}`,
    );

    return true;
  }

  async purgeForInstitution(institutionId: string): Promise<void> {
    await Promise.all([
      this.redisService.delByPattern(`otp:email:${institutionId}:*`),
      this.redisService.delByPattern(`otp:rate:send:${institutionId}:*`),
      this.redisService.delByPattern(`otp:rate:verify:${institutionId}:*`),
    ]);
  }

  private buildOtpKey(institutionId: string, email: string): string {
    return `otp:email:${institutionId}:${email}`;
  }

  private matchesStoredCode(stored: StoredEmailOtp, code: string): boolean {
    const candidate = hashToken(code);

    if (secureCompareHashes(stored.codeHash, candidate)) {
      return true;
    }

    return (
      Boolean(stored.previousCodeHash) &&
      (stored.previousValidUntil ?? 0) > Date.now() &&
      secureCompareHashes(stored.previousCodeHash as string, candidate)
    );
  }

  private async assertCanSend(
    institutionId: string,
    email: string,
  ): Promise<void> {
    const key = `otp:rate:send:${institutionId}:${email}`;
    const count = await this.redisService.incr(key);

    if (count === 1) {
      await this.redisService.expire(key, SEND_RATE_WINDOW_SECONDS);
    }

    if (count > MAX_SEND_ATTEMPTS) {
      throw new HttpException(
        'Too many OTP requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertCanVerify(
    institutionId: string,
    email: string,
  ): Promise<void> {
    const key = `otp:rate:verify:${institutionId}:${email}`;
    const attempts = await this.redisService.get(key);

    if (attempts && Number(attempts) >= MAX_VERIFY_ATTEMPTS) {
      throw new HttpException(
        'Too many failed OTP attempts. Please request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedVerify(
    institutionId: string,
    email: string,
  ): Promise<void> {
    const key = `otp:rate:verify:${institutionId}:${email}`;
    const count = await this.redisService.incr(key);

    if (count === 1) {
      await this.redisService.expire(key, VERIFY_RATE_WINDOW_SECONDS);
    }

    if (count >= MAX_VERIFY_ATTEMPTS) {
      await this.redisService.del(this.buildOtpKey(institutionId, email));
    }
  }
}

function secureCompareHashes(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
