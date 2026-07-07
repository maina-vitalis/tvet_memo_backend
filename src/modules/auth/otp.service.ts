import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { RedisService } from '../../common/redis/redis.service';
import { hashToken } from '../../common/utils/crypto.util';

const OTP_TTL_SECONDS = 10 * 60;
const SEND_RATE_WINDOW_SECONDS = 15 * 60;
const VERIFY_RATE_WINDOW_SECONDS = 15 * 60;
const MAX_SEND_ATTEMPTS = 3;
const MAX_VERIFY_ATTEMPTS = 5;

type StoredEmailOtp = {
  codeHash: string;
};

const CONSUME_OTP_SCRIPT = `
local data = redis.call('GET', KEYS[1])
if not data then return 0 end
local ok, payload = pcall(cjson.decode, data)
if not ok or not payload or payload.codeHash ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`;

@Injectable()
export class OtpService {
  constructor(private readonly redisService: RedisService) {}

  async issueEmailOtp(
    institutionId: string,
    email: string,
    code: string,
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase();
    await this.assertCanSend(institutionId, normalizedEmail);

    await this.redisService.setJson(
      this.buildOtpKey(institutionId, normalizedEmail),
      { codeHash: hashToken(code) } satisfies StoredEmailOtp,
      OTP_TTL_SECONDS,
    );
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

    if (!stored || !this.matchesCode(stored.codeHash, code)) {
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
      .eval(CONSUME_OTP_SCRIPT, 1, key, hashToken(code));

    if (consumed !== 1) {
      await this.recordFailedVerify(institutionId, normalizedEmail);
      return false;
    }

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

  private matchesCode(storedHash: string, code: string): boolean {
    return secureCompareHashes(storedHash, hashToken(code));
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
