"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const postgres_1 = __importDefault(require("postgres"));
async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required');
    }
    const sql = (0, postgres_1.default)(databaseUrl, { max: 1 });
    try {
        await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE institution_plan AS ENUM('trial', 'basic', 'pro');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await sql.unsafe(`
      ALTER TABLE institution
      ADD COLUMN IF NOT EXISTS plan institution_plan DEFAULT 'trial' NOT NULL;
    `);
        console.log('Migration applied successfully');
    }
    finally {
        await sql.end();
    }
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=apply-plan-migration.js.map