import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createPostgresOptions } from './postgres-options';
import * as schema from './schema';

export type DrizzleDB = ReturnType<typeof createDrizzleClient>;

export function createDrizzleClient(databaseUrl: string) {
  const client = postgres(databaseUrl, createPostgresOptions());
  return drizzle(client, { schema });
}
