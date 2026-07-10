import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { assertActorInstitution } from '../../common/rbac/assert-actor-institution';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { departments, users } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import {
  buildProvisionedTraineeAccount,
  hashProvisionedPassword,
} from '../users/provisioned-account.service';
import {
  ParsedRosterRow,
  parseRosterWorkbook,
} from './utils/parse-roster-workbook';
import { BulkUploadSummary } from './types/bulk-upload-result.type';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class BulkUploadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
  ) {}

  /**
   * [BULK PROVISION] Creates trainee accounts from an uploaded roster.
   * Each row uses the shared provisioning path: password = admission number,
   * role = TRAINEE, mustChangePassword = true. Credentials are not emailed
   * in this version — see sendProvisioningCredentialsEmail in
   * UsersService.provision() for the single-user email path.
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

    const seenAdmissionNumbers = new Set<string>();
    const seenEmails = new Set<string>();
    const candidateRows: ParsedRosterRow[] = [];

    for (const row of parsedRows) {
      const identifier = row.admissionNumber;

      if (seenAdmissionNumbers.has(row.admissionNumber)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Duplicate admission number in file',
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
      seenAdmissionNumbers.add(row.admissionNumber);
      if (row.email) seenEmails.add(row.email);
      candidateRows.push(row);
    }

    const admissionNumbers = candidateRows.map((r) => r.admissionNumber);
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

    const departmentRows = await this.db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.institutionId, institutionId));
    const departmentByName = new Map(
      departmentRows.map((d) => [d.name.toLowerCase(), d.id]),
    );

    interface Insertable {
      row: ParsedRosterRow;
      identifier: string;
      values: ReturnType<typeof buildProvisionedTraineeAccount>['values'];
    }
    const insertable: Insertable[] = [];

    for (const row of candidateRows) {
      const identifier = row.admissionNumber;

      if (existingAdmissionNumbers.has(row.admissionNumber)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'skipped',
          reason: 'Admission number already exists',
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

      if (row.email && !EMAIL_PATTERN.test(row.email)) {
        results.push({
          row: row.rowNumber,
          identifier,
          status: 'failed',
          reason: 'Invalid email format',
        });
        continue;
      }

      const departmentId = row.departmentName
        ? (departmentByName.get(row.departmentName.toLowerCase()) ?? null)
        : null;

      const { values } = buildProvisionedTraineeAccount({
        institutionId,
        firstName: row.firstName,
        lastName: row.lastName,
        admissionNumber: row.admissionNumber,
        email: row.email ?? null,
        departmentId,
        phoneNumber: row.phoneNumber ?? null,
      });

      values.passwordHash = await hashProvisionedPassword(row.admissionNumber);

      insertable.push({ row, identifier, values });
    }

    const CHUNK_SIZE = 100;

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
