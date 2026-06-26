import 'dotenv/config';
import argon2 from 'argon2';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const INSTITUTION = {
  name: 'Nairobi Technical Institute',
  subdomain: 'gmail.com',
  schoolCode: 'KMTC-NRB',
  contactEmail: 'meshackkimaiyo5@gmail.com',
};

const TRAINEE = {
  firstName: 'Meshack',
  lastName: 'Kimaiyo',
  email: 'meshackkimaiyo5@gmail.com',
  admissionNumber: 'NTI/2023/1234',
  password: 'NTI/2023/1234',
};

const DEFAULT_ROLES = [
  { name: 'Board of Governors', hierarchyLevel: 1 },
  { name: 'Principal', hierarchyLevel: 2 },
  { name: 'Deputy Principal', hierarchyLevel: 3 },
  { name: 'Head of Department', hierarchyLevel: 4 },
  { name: 'Trainer', hierarchyLevel: 5 },
  { name: 'Support Staff', hierarchyLevel: 6 },
  { name: 'Registry', hierarchyLevel: 7 },
  { name: 'Trainee', hierarchyLevel: 8 },
];

async function ensureRoles(tx, institutionId) {
  const existingRoles = await tx`
    SELECT id, name FROM role WHERE institution_id = ${institutionId}
  `;

  if (existingRoles.length > 0) {
    return existingRoles;
  }

  const roleRows = [];
  for (const role of DEFAULT_ROLES) {
    const [inserted] = await tx`
      INSERT INTO role (institution_id, name, hierarchy_level, is_default)
      VALUES (${institutionId}, ${role.name}, ${role.hierarchyLevel}, true)
      RETURNING id, name
    `;
    roleRows.push(inserted);
  }

  return roleRows;
}

try {
  const passwordHash = await argon2.hash(TRAINEE.password, {
    type: argon2.argon2id,
  });

  await sql.begin(async (tx) => {
    let institutionId;

    const [existingInstitution] = await tx`
      SELECT id, subdomain FROM institution
      WHERE school_code = ${INSTITUTION.schoolCode}
      LIMIT 1
    `;

    if (existingInstitution) {
      institutionId = existingInstitution.id;

      await tx`
        UPDATE institution
        SET
          name = ${INSTITUTION.name},
          subdomain = ${INSTITUTION.subdomain},
          contact_email = ${INSTITUTION.contactEmail}
        WHERE id = ${institutionId}
      `;

      console.log('Updated institution:', institutionId);
    } else {
      const [institution] = await tx`
        INSERT INTO institution (name, subdomain, school_code, contact_email)
        VALUES (
          ${INSTITUTION.name},
          ${INSTITUTION.subdomain},
          ${INSTITUTION.schoolCode},
          ${INSTITUTION.contactEmail}
        )
        RETURNING id
      `;

      institutionId = institution.id;
      console.log('Created institution:', institutionId);
    }

    const roles = await ensureRoles(tx, institutionId);
    const traineeRole = roles.find((role) => role.name === 'Trainee');

    if (!traineeRole) {
      throw new Error('Trainee role not found');
    }

    const [existingUserByEmail] = await tx`
      SELECT id, email FROM "user"
      WHERE institution_id = ${institutionId}
        AND email = ${TRAINEE.email}
      LIMIT 1
    `;

    const [existingUserByAdmission] = await tx`
      SELECT id, email FROM "user"
      WHERE institution_id = ${institutionId}
        AND admission_number = ${TRAINEE.admissionNumber}
      LIMIT 1
    `;

    const existingUser = existingUserByEmail ?? existingUserByAdmission;

    if (existingUser) {
      await tx`
        UPDATE "user"
        SET
          role_id = ${traineeRole.id},
          first_name = ${TRAINEE.firstName},
          last_name = ${TRAINEE.lastName},
          email = ${TRAINEE.email},
          admission_number = ${TRAINEE.admissionNumber},
          password_hash = ${passwordHash},
          must_change_password = true,
          is_active = true
        WHERE id = ${existingUser.id}
      `;

      console.log('Updated trainee:', existingUser.id, '→', TRAINEE.email);
    } else {
      await tx`
        INSERT INTO "user" (
          institution_id,
          role_id,
          first_name,
          last_name,
          email,
          admission_number,
          password_hash,
          must_change_password
        )
        VALUES (
          ${institutionId},
          ${traineeRole.id},
          ${TRAINEE.firstName},
          ${TRAINEE.lastName},
          ${TRAINEE.email},
          ${TRAINEE.admissionNumber},
          ${passwordHash},
          true
        )
      `;

      console.log('Created trainee:', TRAINEE.email);
    }
  });

  console.log('\n--- Seed complete ---');
  console.log('Institution:', INSTITUTION.name);
  console.log('Email domain (subdomain):', INSTITUTION.subdomain);
  console.log('Shortcode:', INSTITUTION.schoolCode);
  console.log('Student email:', TRAINEE.email);
  console.log('Admission number:', TRAINEE.admissionNumber);
  console.log('Default password (shortcode login):', TRAINEE.admissionNumber);
  console.log('\nEmail discovery: use', TRAINEE.email);
  console.log('Shortcode discovery: use', INSTITUTION.schoolCode);
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
