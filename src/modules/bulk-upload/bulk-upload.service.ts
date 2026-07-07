import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq, inArray } from 'drizzle-orm';
import { assertActorInstitution } from '../../common/rbac/assert-actor-institution';
import { canAssignRole } from '../../common/rbac/can-assign-role';
import { Role } from '../../common/rbac/role.enum';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  departments,
  institutions,
  NewUser,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import {
  ParsedRosterRow,
  parseRosterWorkbook,
} from './utils/parse-roster-workbook';
import { BulkUploadSummary } from './types/bulk-upload-result.type';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASSIGNABLE_STAFF_ROLES = Object.values(Role).filter(
  (role) => role !== Role.SUPER_ADMIN,
);

function resolveRole(raw?: string): Role | undefined {
  if (!raw) return undefined;
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return (Object.values(Role) as string[]).includes(normalized)
    ? (normalized as Role)
    : undefined;
}

@Injectable()
export class BulkUploadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * [BULK PROVISION] Creates many accounts from an uploaded roster
   * (.xlsx/.xls) — one row per person, identified by either an Admission
   * Number or a Staff Number column. The Role column is optional: blank or
   * absent defaults to TRAINEE (student) regardless of which identifier
   * column supplied the value — no email needed, temp password = the
   * identifier itself, they log in via AuthService.registryLogin. Any other
   * (ceiling-checked) Role makes the row staff: a real email is mandatory
   * since staff have no admission-number-style login path, temp password =
   * the identifier, and credentials are emailed like the single-user
   * provision flow.
   *
   * Correctness constraints this method is built around:
   * - Duplicate checks (admission number, staff number, email) are single
   *   bulk queries, not one query per row.
   * - A bad row never aborts the batch: parse errors, duplicates, role
   *   failures, and insert failures are all collected into per-row results
   *   instead of throwing.
   */
  async upload(
    institutionId: string,
    actor: AuthenticatedUser,
    buffer: Buffer,
  ): Promise<BulkUploadSummary> {
    assertActorInstitution(actor, institutionId);

    const { rows: parsedRows, errors: parseErrors } =
      parseRosterWorkbook(buffer);

    const results: BulkUploadSummary['rows'] = parseErrors.map((e) => ({
      row: e.row,
      identifier: e.identifier,
      status: 'failed',
      reason: e.reason,
    }));

    if (parsedRows.length === 0) {
      return this.summarize(results);
    }

    // De-dupe within the file itself before ever touching the DB.
    const seenAdmissionNumbers = new Set<string>();
    const seenStaffNumbers = new Set<string>();
    const seenEmails = new Set<string>();
    const candidateRows: ParsedRosterRow[] = [];

    for (const row of parsedRows) {
      const identifier = row.admissionNumber ?? row.staffNumber ?? '';

      if (
        row.admissionNumber &&
        seenAdmissionNumbers.has(row.admissionNumber)
      ) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Duplicate admission number in file',
        });
        continue;
      }
      if (row.staffNumber && seenStaffNumbers.has(row.staffNumber)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Duplicate staff number in file',
        });
        continue;
      }
      if (row.email && seenEmails.has(row.email)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Duplicate email in file',
        });
        continue;
      }
      if (row.admissionNumber) seenAdmissionNumbers.add(row.admissionNumber);
      if (row.staffNumber) seenStaffNumbers.add(row.staffNumber);
      if (row.email) seenEmails.add(row.email);
      candidateRows.push(row);
    }

    // Bulk existing-record checks — one query per identifier kind, not one
    // query per row (the main perf trap this method is designed to avoid).
    const admissionNumbers = candidateRows
      .map((r) => r.admissionNumber)
      .filter((v): v is string => Boolean(v));
    const existingAdmissionRows = admissionNumbers.length
      ? await this.db
          .select({ admissionNumber: users.admissionNumber })
          .from(users)
          .where(
            and(
              eq(users.institutionId, institutionId),
              inArray(users.admissionNumber, admissionNumbers),
            ),
          )
      : [];
    const existingAdmissionNumbers = new Set(
      existingAdmissionRows.map((r) => r.admissionNumber),
    );

    const staffNumbers = candidateRows
      .map((r) => r.staffNumber)
      .filter((v): v is string => Boolean(v));
    const existingStaffRows = staffNumbers.length
      ? await this.db
          .select({ staffNumber: users.staffNumber })
          .from(users)
          .where(
            and(
              eq(users.institutionId, institutionId),
              inArray(users.staffNumber, staffNumbers),
            ),
          )
      : [];
    const existingStaffNumbers = new Set(
      existingStaffRows.map((r) => r.staffNumber),
    );

    const explicitEmails = candidateRows
      .map((r) => r.email)
      .filter((e): e is string => Boolean(e));
    const existingEmailRows = explicitEmails.length
      ? await this.db
          .select({ email: users.email })
          .from(users)
          .where(inArray(users.email, explicitEmails))
      : [];
    const existingEmails = new Set(existingEmailRows.map((r) => r.email));

    // Departments resolved once for the whole batch (best-effort name match;
    // an unmatched department never fails the row, it's just left unset).
    const departmentRows = await this.db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.institutionId, institutionId));
    const departmentByName = new Map(
      departmentRows.map((d) => [d.name.toLowerCase(), d.id]),
    );

    const [institution] = await this.db
      .select({ schoolCode: institutions.schoolCode, name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1);
    const schoolCodeSlug = (institution?.schoolCode ?? institutionId)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    interface Insertable {
      row: ParsedRosterRow;
      identifier: string;
      values: NewUser;
      isStaff: boolean;
      tempPassword: string;
    }
    const insertable: Insertable[] = [];

    for (const row of candidateRows) {
      const identifier = row.admissionNumber ?? row.staffNumber ?? '';

      if (
        row.admissionNumber &&
        existingAdmissionNumbers.has(row.admissionNumber)
      ) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Admission number already exists',
        });
        continue;
      }
      if (row.staffNumber && existingStaffNumbers.has(row.staffNumber)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Staff number already exists',
        });
        continue;
      }
      if (row.email && existingEmails.has(row.email)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Email already registered',
        });
        continue;
      }

      const departmentId = row.departmentName
        ? (departmentByName.get(row.departmentName.toLowerCase()) ?? null)
        : null;

      // Role column is optional: blank/absent -> TRAINEE (the common case,
      // regardless of which identifier column supplied the value). Only an
      // explicit, unrecognized Role value is an error.
      const roleText = row.roleRaw?.trim();
      let role: Role;
      if (roleText) {
        const parsedRole = resolveRole(roleText);
        if (!parsedRole) {
          results.push({
            row: row.rowNumber,
            identifier,
            status: 'failed',
            reason: `Invalid Role "${roleText}" (expected one of: ${ASSIGNABLE_STAFF_ROLES.join(', ')})`,
          });
          continue;
        }
        role = parsedRole;
      } else {
        role = Role.TRAINEE;
      }

      if (!canAssignRole(actor, role)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'failed',
          reason: `Cannot assign role ${role}`,
        });
        continue;
      }

      if (row.email && !EMAIL_PATTERN.test(row.email)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'failed',
          reason: 'Invalid email format',
        });
        continue;
      }

      const isTrainee = role === Role.TRAINEE;

      // Staff have no admission-number-style login — email is how they sign
      // in (OTP/password), so a real one is mandatory for non-TRAINEE roles.
      if (!isTrainee && !row.email) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'failed',
          reason:
            'Email is required for staff rows (rows without a Role default to TRAINEE and don’t need one)',
        });
        continue;
      }

      const tempPassword = identifier;
      const passwordHash = await argon2.hash(tempPassword, {
        type: argon2.argon2id,
      });

      const email = isTrainee
        ? (row.email ??
          `${identifier.toLowerCase().replace(/[^a-z0-9]/g, '')}.${schoolCodeSlug}@students.tvetmemo.internal`)
        : row.email!;

      insertable.push({
        row,
        identifier,
        isStaff: !isTrainee,
        tempPassword,
        values: {
          institutionId,
          role,
          departmentId,
          firstName: row.firstName,
          lastName: row.lastName,
          email,
          // Whichever identifier column carried the value, a TRAINEE always
          // gets it stored as admissionNumber (registryLogin looks it up
          // there); staff always get it stored as staffNumber.
          admissionNumber: isTrainee
            ? identifier
            : row.admissionNumber && row.admissionNumber !== identifier
              ? row.admissionNumber
              : null,
          staffNumber: isTrainee
            ? row.staffNumber && row.staffNumber !== identifier
              ? row.staffNumber
              : null
            : identifier,
          phoneNumber: row.phoneNumber || null,
          passwordHash,
          mustChangePassword: true,
        },
      });
    }

    // Batch insert in chunks (avoids parameter-limit errors / one giant
    // insert). If a chunk fails outright (e.g. a race-condition unique
    // violation), fall back to inserting that chunk row-by-row so a single
    // bad row can't take the rest of the chunk down with it.
    const CHUNK_SIZE = 100;
    const createdStaff: Array<{
      email: string;
      firstName: string;
      staffNumber: string;
      tempPassword: string;
    }> = [];

    for (let i = 0; i < insertable.length; i += CHUNK_SIZE) {
      const chunk = insertable.slice(i, i + CHUNK_SIZE);
      try {
        await this.db.insert(users).values(chunk.map((c) => c.values));
        for (const c of chunk) {
          results.push({
            row: c.row.rowNumber,
            identifier: c.identifier,
            status: 'created',
          });
          if (c.isStaff) {
            createdStaff.push({
              email: c.values.email,
              firstName: c.values.firstName,
              staffNumber: c.values.staffNumber!,
              tempPassword: c.tempPassword,
            });
          }
        }
      } catch {
        for (const c of chunk) {
          try {
            await this.db.insert(users).values(c.values);
            results.push({
              row: c.row.rowNumber,
              identifier: c.identifier,
              status: 'created',
            });
            if (c.isStaff) {
              createdStaff.push({
                email: c.values.email,
                firstName: c.values.firstName,
                staffNumber: c.values.staffNumber!,
                tempPassword: c.tempPassword,
              });
            }
          } catch {
            results.push({
              row: c.row.rowNumber,
              identifier: c.identifier,
              status: 'failed',
              reason: 'Could not create user (possible duplicate)',
            });
          }
        }
      }
    }

    // Email provisioning credentials to created staff (best-effort, mirrors
    // UsersService.provision()). Students never get one — they already know
    // their admission number and log in with it directly.
    for (const staff of createdStaff) {
      try {
        await this.emailService.sendProvisioningCredentials({
          to: staff.email,
          firstName: staff.firstName,
          schoolCode: institution?.schoolCode ?? 'N/A',
          tempPassword: staff.tempPassword,
          loginIdentifier: staff.staffNumber,
          loginIdentifierLabel: 'Staff Number',
          institutionName: institution?.name,
        });
      } catch (emailError) {
        console.error('Bulk provisioning email failed:', emailError);
      }
    }

    const summary = this.summarize(results);

    await this.auditService.log({
      institutionId,
      actorId: actor.id,
      action: 'user.bulk_provision',
      entityType: 'user',
      entityId: institutionId,
      afterState: {
        totalRows: summary.totalRows,
        createdCount: summary.createdCount,
        skippedCount: summary.skippedCount,
        failedCount: summary.failedCount,
      },
    });

    return summary;
  }

  private summarize(rows: BulkUploadSummary['rows']): BulkUploadSummary {
    const sorted = [...rows].sort((a, b) => a.row - b.row);
    return {
      totalRows: sorted.length,
      createdCount: sorted.filter((r) => r.status === 'created').length,
      skippedCount: sorted.filter((r) => r.status === 'skipped').length,
      failedCount: sorted.filter((r) => r.status === 'failed').length,
      rows: sorted,
    };
  }
}
