import * as argon2 from 'argon2';
import { Role } from '../../common/rbac';
import { NewUser } from '../../database/schema';

export type ProvisionedTraineeInput = {
  institutionId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  email?: string | null;
  departmentId?: string | null;
  phoneNumber?: string | null;
};

export type ProvisionedTraineeValues = {
  values: NewUser;
  initialPassword: string;
};

/**
 * Shared provisioning logic for single and bulk trainee provisioning.
 * Initial password is always the admission number.
 */
export function buildProvisionedTraineeAccount(
  input: ProvisionedTraineeInput,
): ProvisionedTraineeValues {
  const admissionNumber = input.admissionNumber.trim();
  const initialPassword = deriveProvisionedPassword(admissionNumber);

  return {
    initialPassword,
    values: {
      institutionId: input.institutionId,
      role: Role.TRAINEE,
      departmentId: input.departmentId ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email?.toLowerCase() ?? null,
      admissionNumber,
      phoneNumber: input.phoneNumber ?? null,
      passwordHash: '', // filled by caller after hashing
      mustChangePassword: true,
      emailVerified: true,
    },
  };
}

export function deriveProvisionedPassword(admissionNumber: string): string {
  return admissionNumber.trim();
}

export async function hashProvisionedPassword(
  admissionNumber: string,
): Promise<string> {
  return argon2.hash(deriveProvisionedPassword(admissionNumber), {
    type: argon2.argon2id,
  });
}
