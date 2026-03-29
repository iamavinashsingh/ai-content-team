// src/database/index.js
// ============================================================
// PostgreSQL Database Layer (Neon)
//
// Responsibilities:
//  - Connection pool management
//  - Schema creation (run once via npm run db:migrate)
//  - CRUD helpers for: Users, Projects, Document_Versions, API_Keys
//  - Snapshot save/restore for the snapshotManager node
// ============================================================

import pg from 'pg';
import { DB_CONFIG } from '../config/index.js';

const { Pool } = pg;

// ── Singleton connection pool ──────────────────────────────
let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool(DB_CONFIG);

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });

    pool.on('connect', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[DB] New client connected to Neon PostgreSQL');
      }
    });
  }
  return pool;
}

// ── Generic query helper ───────────────────────────────────
// All agents use this — never import pg directly in agent files
export async function query(text, params = []) {
  const pool = getPool();
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] Query executed in ${duration}ms — rows: ${result.rowCount}`);
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '\nQuery:', text);
    throw err;
  }
}

// ── Health Check ───────────────────────────────────────────
// Used by workspaceHealthCheck node (Node 9)
export async function checkDbHealth() {
  try {
    const result = await query('SELECT NOW() as time');
    return { healthy: true, serverTime: result.rows[0].time };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

// ── Schema Definitions ─────────────────────────────────────
// Run via: npm run db:migrate
export const SCHEMA_SQL = `
  -- Enable UUID generation
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- ── Users ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── Workspaces (multi-tenant support) ─────────────────
  CREATE TABLE IF NOT EXISTS workspaces (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    cms_target    TEXT CHECK (cms_target IN ('wordpress', 'ghost', 'none')) DEFAULT 'none',
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── API Keys (encrypted at application layer) ─────────
  -- We store the encrypted ciphertext, never plaintext
  CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    service         TEXT NOT NULL,   -- 'openai' | 'pinecone' | 'wordpress' | etc.
    encrypted_key   TEXT NOT NULL,   -- AES-256 encrypted value
    key_hint        TEXT,            -- Last 4 chars of key for UI display
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, service)
  );

  -- ── Projects ───────────────────────────────────────────
  -- Each article/content piece = one Project
  CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title           TEXT,
    raw_brief       TEXT NOT NULL,
    structured_brief JSONB,
    outline         JSONB,
    status          TEXT CHECK (status IN (
                      'draft', 'researching', 'outlining', 'writing',
                      'editing', 'review', 'publishing', 'published', 
                      'error', 'paused'
                    )) DEFAULT 'draft',
    graph_status    TEXT DEFAULT 'running',
    total_tokens    INTEGER DEFAULT 0,
    estimated_cost  NUMERIC(10, 6) DEFAULT 0,
    cms_target      TEXT,
    published_url   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── Document Versions (Snapshot Manager) ─────────────
  -- Node 17: snapshotManager saves here after every section
  CREATE TABLE IF NOT EXISTS document_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    version_label   TEXT NOT NULL,   -- e.g. 'v1.2_section_3_complete'
    version_number  INTEGER NOT NULL,
    section_id      TEXT,            -- Which section triggered the snapshot
    graph_state     JSONB NOT NULL,  -- Full serialized LangGraph state
    drafted_sections JSONB,          -- Quick-access copy of sections at this point
    token_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, version_number)
  );

  -- ── Token Log ─────────────────────────────────────────
  -- Persisted copy of state.tokenLog for cost analytics
  CREATE TABLE IF NOT EXISTS token_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_name   TEXT NOT NULL,
    model        TEXT NOT NULL,
    tokens_used  INTEGER NOT NULL,
    cost_usd     NUMERIC(10, 6),
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── Indexes ────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_projects_workspace   ON projects(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);
  CREATE INDEX IF NOT EXISTS idx_doc_versions_project ON document_versions(project_id);
  CREATE INDEX IF NOT EXISTS idx_token_events_project ON token_events(project_id);
`;

// ── Project CRUD ───────────────────────────────────────────

export async function createProject({ workspaceId, rawBrief, cmsTarget = 'none' }) {
  // Auto-create workspace if it doesn't exist to prevent foreign key errors
  await query(
    `INSERT INTO workspaces (id, name, cms_target) VALUES ($1, 'Default Workspace', 'none') ON CONFLICT (id) DO NOTHING`,
    [workspaceId]
  );

  const result = await query(
    `INSERT INTO projects (workspace_id, raw_brief, cms_target, status)
     VALUES ($1, $2, $3, 'draft')
     RETURNING *`,
    [workspaceId, rawBrief, cmsTarget]
  );
  return result.rows[0];
}

export async function getProject(projectId) {
  const result = await query(
    `SELECT * FROM projects WHERE id = $1`,
    [projectId]
  );
  return result.rows[0] || null;
}

export async function updateProject(projectId, fields) {
  // Dynamically build SET clause from provided fields
  const allowedFields = [
    'title', 'structured_brief', 'outline', 'status', 'graph_status',
    'total_tokens', 'estimated_cost', 'published_url',
  ];

  const updates = [];
  const values = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = $${paramIdx}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      paramIdx++;
    }
  }

  if (updates.length === 0) return null;

  updates.push(`updated_at = NOW()`);
  values.push(projectId);

  const result = await query(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  return result.rows[0];
}

// ── Snapshot CRUD (for snapshotManager node) ─────────────

export async function saveSnapshot({ projectId, sectionId, graphState, draftedSections, tokenCount }) {
  // Get current version count for this project
  const countResult = await query(
    `SELECT COALESCE(MAX(version_number), 0) as max_version FROM document_versions WHERE project_id = $1`,
    [projectId]
  );
  const nextVersion = countResult.rows[0].max_version + 1;
  const versionLabel = `v${nextVersion}_section_${sectionId}_complete`;

  const result = await query(
    `INSERT INTO document_versions 
      (project_id, version_label, version_number, section_id, graph_state, drafted_sections, token_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, version_label, version_number, created_at`,
    [
      projectId,
      versionLabel,
      nextVersion,
      sectionId,
      JSON.stringify(graphState),
      JSON.stringify(draftedSections),
      tokenCount,
    ]
  );

  return result.rows[0];
}

export async function getSnapshot(projectId, versionNumber) {
  const result = await query(
    `SELECT * FROM document_versions WHERE project_id = $1 AND version_number = $2`,
    [projectId, versionNumber]
  );
  return result.rows[0] || null;
}

export async function listSnapshots(projectId) {
  const result = await query(
    `SELECT id, version_label, version_number, section_id, token_count, created_at
     FROM document_versions
     WHERE project_id = $1
     ORDER BY version_number DESC`,
    [projectId]
  );
  return result.rows;
}

// ── Token Event Logging ────────────────────────────────────

export async function logTokenEvent({ projectId, agentName, model, tokensUsed, costUsd }) {
  await query(
    `INSERT INTO token_events (project_id, agent_name, model, tokens_used, cost_usd)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, agentName, model, tokensUsed, costUsd]
  );

  // Also update the running total on the project
  await query(
    `UPDATE projects 
     SET total_tokens = total_tokens + $1,
         estimated_cost = estimated_cost + $2,
         updated_at = NOW()
     WHERE id = $3`,
    [tokensUsed, costUsd, projectId]
  );
}

export async function getTokenSummary(projectId) {
  const result = await query(
    `SELECT 
       SUM(tokens_used) as total_tokens,
       SUM(cost_usd) as total_cost,
       COUNT(*) as api_calls,
       agent_name,
       model
     FROM token_events
     WHERE project_id = $1
     GROUP BY agent_name, model
     ORDER BY SUM(tokens_used) DESC`,
    [projectId]
  );
  return result.rows;
}

// ── Graceful Shutdown ──────────────────────────────────────
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed.');
  }
}
