// scripts/migrate.js
// Run with: npm run db:migrate
// Creates all tables defined in src/database/index.js

import 'dotenv/config';
import { getPool, SCHEMA_SQL, closePool } from '../src/database/index.js';

async function migrate() {
  console.log('[Migrate] Starting database migration...');
  console.log('[Migrate] Target:', process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://***@'));

  const pool = getPool();

  try {
    await pool.query(SCHEMA_SQL);
    console.log('[Migrate] ✅ All tables created/verified successfully.');
    console.log('[Migrate] Tables: users, workspaces, api_keys, projects, document_versions, token_events');
  } catch (err) {
    console.error('[Migrate] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

migrate();
