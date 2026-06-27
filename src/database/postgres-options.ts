import type { Options } from 'postgres';

/** Shared postgres.js options tuned for Neon pooler + serverless Postgres. */
export function createPostgresOptions(overrides: Options<Record<string, never>> = {}): Options<Record<string, never>> {
  return {
    max: 10,
    prepare: false,
    ssl: 'require',
    idle_timeout: 20,
    connect_timeout: 30,
    ...overrides,
  };
}
