import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function addStudentRole() {
  console.log('🔄 Adding Student role to all institutions...\n');

  try {
    // Get all institutions
    const allInstitutions = await sql`
      SELECT id, name, school_code FROM institution
    `;

    console.log(`Found ${allInstitutions.length} institution(s)\n`);

    for (const institution of allInstitutions) {
      console.log(`Processing: ${institution.name} (${institution.school_code})`);

      // Check if Student role already exists
      const existingRole = await sql`
        SELECT id FROM role 
        WHERE institution_id = ${institution.id} 
        AND LOWER(name) = 'student'
        LIMIT 1
      `;

      if (existingRole.length > 0) {
        console.log(`  ✓ Student role already exists\n`);
        continue;
      }

      // Insert Student role
      await sql`
        INSERT INTO role (
          institution_id, 
          name, 
          hierarchy_level, 
          send_scope, 
          content_access, 
          admin_rights, 
          is_default, 
          is_active
        )
        VALUES (
          ${institution.id},
          'Student',
          8,
          '{}'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          true,
          true
        )
      `;

      console.log(`  ✅ Student role created\n`);
    }

    console.log('✅ Done! Student role added to all institutions.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

addStudentRole();
