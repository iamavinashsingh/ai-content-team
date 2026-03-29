// src/api/routes.js
// ============================================================
// REST API Layer — All 3 endpoints + SSE streaming
//
// POST /api/v1/project/init
//   Starts the PM Agent with a content brief
//
// GET  /api/v1/project/:id/stream
//   Server-Sent Events — streams real-time graph progress
//   to the React dashboard
//
// POST /api/v1/project/:id/feedback
//   Resumes an interrupted graph with human input
//   (answers to clarifying questions OR article review feedback)
//
// GET  /api/v1/project/:id/snapshots
//   Lists all saved versions for rollback
//
// POST /api/v1/project/:id/rollback/:version
//   Restores a previous document version
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getGraph } from '../graph/graphBuilder.js';
import { createProject, getProject, listSnapshots, getSnapshot } from '../database/index.js';
import { createInitialState } from '../state/graphState.js';

const router = Router();

// ── In-memory run registry ─────────────────────────────────
// Maps projectId → { thread_id, sseClients: Set }
// In production: use Redis for multi-instance support
const activeRuns = new Map();

// ── SSE helper ─────────────────────────────────────────────
function sseWrite(res, eventType, data) {
  if (res.writableEnded) return;
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Broadcast to all SSE clients for a project
function broadcast(projectId, eventType, data) {
  const run = activeRuns.get(projectId);
  if (!run) return;
  for (const client of run.sseClients) {
    sseWrite(client, eventType, data);
  }
}

// ── POST /api/v1/project/init ──────────────────────────────
// Start a new content generation project
router.post('/project/init', async (req, res) => {
  const { brief, cmsTarget = 'none', workspaceId } = req.body;

  if (!brief || typeof brief !== 'string' || brief.trim().length < 10) {
    return res.status(400).json({
      error: 'brief is required and must be at least 10 characters',
    });
  }

  try {
    // Create project record in PostgreSQL
    const project = await createProject({
      workspaceId: workspaceId || uuidv4(),
      rawBrief:    brief.trim(),
      cmsTarget,
    });

    const projectId  = project.id;
    const threadId   = uuidv4();  // LangGraph thread ID for state persistence

    // Register this run
    activeRuns.set(projectId, { threadId, sseClients: new Set() });

    // ── Kick off the graph in the background ───────────
    // We don't await — the graph runs async, broadcasting via SSE
    runGraphAsync(projectId, threadId, brief.trim());

    console.log(`[API] Project initialized: ${projectId}`);

    return res.status(201).json({
      projectId,
      threadId,
      status:    'started',
      streamUrl: `/api/v1/project/${projectId}/stream`,
      message:   'Connect to streamUrl to receive real-time updates',
    });
  } catch (err) {
    console.error('[API /init]', err.message);
    return res.status(500).json({ error: 'Failed to initialize project', details: err.message });
  }
});

// ── Background graph runner ────────────────────────────────
async function runGraphAsync(projectId, threadId, rawBrief) {
  const graph = getGraph();
  const workspaceId = uuidv4();

  const initialState = createInitialState(projectId, workspaceId, rawBrief);

  const config = {
    configurable: { thread_id: threadId },
    recursionLimit: 500,  // Increased from 150: Large articles heavily utilize the 28-node graph
    version: 'v2',        // Required by streamEvents
  };

  try {
    broadcast(projectId, 'status', { message: 'Graph started', node: 'pmStrategist' });

    // Stream graph events
    const stream = graph.streamEvents(initialState, config);

    for await (const event of stream) {
      const { event: eventType, name, data } = event;

      // ── Broadcast node transitions ─────────────────
      if (eventType === 'on_chain_start' && name) {
        broadcast(projectId, 'node_start', {
          node:      name,
          timestamp: new Date().toISOString(),
        });
      }

      if (eventType === 'on_chain_end' && name) {
        const outputKeys = data?.output ? Object.keys(data.output) : [];
        broadcast(projectId, 'node_complete', {
          node:       name,
          outputKeys,
          timestamp:  new Date().toISOString(),
        });
      }

      // ── Broadcast LLM streaming tokens ─────────────
      if (eventType === 'on_chat_model_stream') {
        const chunk = data?.chunk?.content;
        if (chunk) {
          broadcast(projectId, 'token', { text: chunk });
        }
      }

      // ── Broadcast interrupt (human input needed) ────
      if (eventType === 'on_custom_event' && data?.type === 'interrupt') {
        broadcast(projectId, 'interrupt', data);
      }

      // ── Broadcast graph state updates ───────────────
      if (eventType === 'on_chain_end' && data?.output) {
        const out = data.output;

        // Article ready for review
        if (out.presentationData) {
          broadcast(projectId, 'article_ready', out.presentationData);
        }

        // Clarifying questions
        if (out.clarifyingQuestions?.length > 0) {
          broadcast(projectId, 'clarifying_questions', {
            questions: out.clarifyingQuestions,
          });
        }

        // Token budget update
        if (out.totalTokensUsed) {
          broadcast(projectId, 'budget_update', {
            totalTokensUsed: out.totalTokensUsed,
            estimatedCostUsd: out.estimatedCostUsd,
          });
        }

        // Published URL
        if (out.publishedUrl) {
          broadcast(projectId, 'published', { url: out.publishedUrl });
        }

        // Escalation
        if (out.graphStatus === 'escalated') {
          broadcast(projectId, 'escalated', {
            reason: out.escalationReason,
          });
        }
      }
    }

    broadcast(projectId, 'complete', { message: 'Graph execution finished', projectId });
    console.log(`[Graph] Project ${projectId} completed`);
  } catch (err) {
    console.error(`[Graph] Project ${projectId} crashed:`, err.message);
    broadcast(projectId, 'error', { message: err.message, projectId });
  }
}

// ── GET /api/v1/project/:id/stream ────────────────────────
// Server-Sent Events — client connects and receives live updates
router.get('/project/:id/stream', (req, res) => {
  const { id: projectId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering
  res.flushHeaders();

  // Register this client
  const run = activeRuns.get(projectId);
  if (!run) {
    sseWrite(res, 'error', { message: 'Project not found or not running' });
    return res.end();
  }

  run.sseClients.add(res);
  console.log(`[SSE] Client connected to project: ${projectId} (${run.sseClients.size} clients)`);

  // Send a heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    run?.sseClients.delete(res);
    console.log(`[SSE] Client disconnected from project: ${projectId}`);
  });
});

// ── POST /api/v1/project/:id/feedback ─────────────────────
// Resume an interrupted graph with human input
router.post('/project/:id/feedback', async (req, res) => {
  const { id: projectId } = req.params;
  const { type, payload } = req.body;
  // type: 'clarification' | 'review'
  // payload: answers string OR feedback object

  if (!type || !payload) {
    return res.status(400).json({ error: 'type and payload are required' });
  }

  const run = activeRuns.get(projectId);
  if (!run) {
    return res.status(404).json({ error: 'Project not found or not running' });
  }

  try {
    const graph  = getGraph();
    const config = { configurable: { thread_id: run.threadId } };

    // Resume the graph at the interrupt point
    // LangGraph resumes from exactly where it paused
    const resumeValue = type === 'clarification'
      ? { answers: payload }   // Answers to clarifying questions
      : payload;                // Full feedback object for review

    broadcast(projectId, 'status', {
      message:   `Human input received (${type}) — resuming graph`,
      timestamp: new Date().toISOString(),
    });

    // Resume is non-blocking — graph continues via the stream
    graph.invoke(
      { messages: [{ role: 'user', content: JSON.stringify(resumeValue) }] },
      { ...config, resumeValue }
    ).catch((err) => {
      console.error(`[API /feedback] Graph resume error: ${err.message}`);
      broadcast(projectId, 'error', { message: err.message });
    });

    return res.json({
      status:  'resumed',
      message: 'Graph resumed successfully',
      type,
    });
  } catch (err) {
    console.error('[API /feedback]', err.message);
    return res.status(500).json({ error: 'Failed to resume graph', details: err.message });
  }
});

// ── GET /api/v1/project/:id ────────────────────────────────
// Get project details and current status
router.get('/project/:id', async (req, res) => {
  const { id: projectId } = req.params;
  try {
    const project = await getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json(project);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/project/:id/snapshots ─────────────────────
// List all saved document versions for rollback
router.get('/project/:id/snapshots', async (req, res) => {
  const { id: projectId } = req.params;
  try {
    const snapshots = await listSnapshots(projectId);
    return res.json({ snapshots });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/project/:id/rollback/:version ────────────
// Restore a document to a previous snapshot version
router.post('/project/:id/rollback/:version', async (req, res) => {
  const { id: projectId, version } = req.params;
  try {
    const snapshot = await getSnapshot(projectId, parseInt(version, 10));
    if (!snapshot) {
      return res.status(404).json({ error: `Snapshot version ${version} not found` });
    }

    // Return the snapshot's drafted sections for the frontend to display
    return res.json({
      version:         snapshot.version_number,
      label:           snapshot.version_label,
      restoredAt:      new Date().toISOString(),
      draftedSections: snapshot.drafted_sections,
      tokenCount:      snapshot.token_count,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
