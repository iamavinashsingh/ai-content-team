// src/index.js
// ============================================================
// AI Content Team — Express Server (Final)
// ============================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateEnv, APP_CONFIG } from './config/index.js';
import { checkDbHealth, closePool } from './database/index.js';
import { checkPineconeHealth } from './vector/index.js';
import { getGraph } from './graph/graphBuilder.js';
import apiRoutes from './api/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate env first
try { validateEnv(); } catch (err) { console.error(err.message); process.exit(1); }

const app = express();

// ── Middleware ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));  // CSP off for SSE
app.use(cors({
  origin:  APP_CONFIG.isDev ? '*' : process.env.ALLOWED_ORIGINS?.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(APP_CONFIG.isDev ? 'dev' : 'combined'));

// ── Health check ───────────────────────────────────────────
app.get('/health', async (req, res) => {
  const [db, pinecone] = await Promise.all([checkDbHealth(), checkPineconeHealth()]);
  const allHealthy = db.healthy && pinecone.healthy;
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    version: '2.0.0',
    services: { postgres: db, pinecone },
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────────────────
app.use('/api/v1', apiRoutes);

// ── Serve frontend (production) ───────────────────────────
// In dev, Vite handles the frontend on :5173 and proxies /api to :3001
// In production, Express serves the built frontend from frontend/dist
if (!APP_CONFIG.isDev) {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── 404 (API only in production since * is caught above) ──
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(APP_CONFIG.isDev && { details: err.message }),
  });
});

// ── Boot sequence ──────────────────────────────────────────
async function boot() {
  console.log('\n🚀 AI Content Team — Booting...\n');

  process.stdout.write('  Compiling LangGraph (28 nodes)...  ');
  getGraph();
  console.log('✅');

  process.stdout.write('  Connecting to Neon PostgreSQL...   ');
  const db = await checkDbHealth();
  console.log(db.healthy ? '✅' : `❌ ${db.error}`);
  if (!db.healthy) { console.error('  Run: npm run db:migrate'); process.exit(1); }

  process.stdout.write('  Connecting to Pinecone...          ');
  const pc = await checkPineconeHealth();
  console.log(pc.healthy ? '✅' : `⚠️  ${pc.error}`);

  const server = app.listen(APP_CONFIG.port, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   AI Content Team  ·  V2.0.0  ·  Live  ║
╠══════════════════════════════════════════╣
║  Port  ${String(APP_CONFIG.port).padEnd(35)}║
║  Mode  ${APP_CONFIG.nodeEnv.padEnd(35)}║
╠══════════════════════════════════════════╣
║  POST  /api/v1/project/init             ║
║  GET   /api/v1/project/:id/stream       ║
║  POST  /api/v1/project/:id/feedback     ║
║  GET   /api/v1/project/:id/snapshots    ║
║  POST  /api/v1/project/:id/rollback/:v  ║
║  GET   /health                          ║
╚══════════════════════════════════════════╝`);
  });

  // Graceful shutdown
  async function shutdown(signal) {
    console.log(`\n[Server] ${signal} — shutting down...`);
    server.close(async () => {
      await closePool();
      console.log('[Server] ✅ Clean shutdown');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err);
    shutdown('uncaughtException');
  });
}

boot().catch((err) => { console.error('[Boot] Fatal:', err); process.exit(1); });
