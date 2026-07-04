/**
 * @deprecated Use `pnpm db:seed-auth` (tsx src/database/seed/auth-test.ts).
 * Kept as a thin wrapper for existing workflows.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('pnpm', ['exec', 'tsx', 'src/database/seed/auth-test.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);