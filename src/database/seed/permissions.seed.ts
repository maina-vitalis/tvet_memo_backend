import { eq } from 'drizzle-orm';
import { DrizzleDB } from '../drizzle';
import { permissions } from '../schema/permissions';
import { ALL_PERMISSIONS } from './permissions';

/**
 * Idempotent seeding of the global permissions registry.
 * Safe to run multiple times.
 */
export async function seedPermissions(db: DrizzleDB) {
  console.log('[permissions] Seeding global permissions...');

  for (const perm of ALL_PERMISSIONS) {
    const existing = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, perm.key))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(permissions).values(perm);
      console.log(`  + ${perm.key}`);
    }
  }

  console.log('[permissions] Done.');
}
