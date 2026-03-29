// src/agents/workspaceHealthCheck.js
// ============================================================
// Node 9: Workspace Health Check ⭐ NEW (V2 Loophole Fix #10)
//
// Responsibilities:
//  - Ping OpenAI API (GPT + DALL-E)
//  - Ping Pinecone to verify index is accessible
//  - Ping the target CMS (WordPress/Ghost) to verify credentials
//  - Report a clear health summary before writing begins
//
// Design doc: "Pings OpenAI, DALL-E, Pinecone, and target CMS
//              to ensure credentials are valid BEFORE spending
//              compute time."
//
// State reads:  structuredBrief (for cmsTarget)
// State writes: workspaceHealth, graphStatus
// ============================================================

import { SERVICES } from '../config/index.js';
import { checkDbHealth } from '../database/index.js';
import { checkPineconeHealth } from '../vector/index.js';

// ── OpenAI health check ────────────────────────────────────
async function checkOpenAI() {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    return { healthy: response.ok, statusCode: response.status };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

// ── WordPress health check ─────────────────────────────────
async function checkWordPress() {
  const { url, username, appPassword } = SERVICES.wordpress;
  if (!url || !username || !appPassword) {
    return { healthy: false, error: 'WordPress credentials not configured' };
  }

  try {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
    const response = await fetch(`${url}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(8000),
    });
    return { healthy: response.ok, statusCode: response.status };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

// ── Ghost health check ─────────────────────────────────────
async function checkGhost() {
  const { url, adminApiKey } = SERVICES.ghost;
  if (!url || !adminApiKey) {
    return { healthy: false, error: 'Ghost credentials not configured' };
  }

  try {
    // Ghost Admin API: split key into id and secret
    const [id, secret] = adminApiKey.split(':');
    if (!id || !secret) {
      return { healthy: false, error: 'Ghost Admin API key format should be id:secret' };
    }

    const response = await fetch(`${url}/ghost/api/admin/site/`, {
      headers: { Authorization: `Ghost ${adminApiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    return { healthy: response.ok, statusCode: response.status };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

export async function workspaceHealthNode(state) {
  const cmsTarget = state.structuredBrief?.cmsTarget || 'none';
  console.log('[workspaceHealthCheck] Pinging all services...');

  // Run all health checks in parallel for speed
  const [openaiResult, pineconeResult] = await Promise.all([
    checkOpenAI(),
    checkPineconeHealth(),
  ]);

  // Only check CMS if one is configured
  let cmsResult = { healthy: true, note: 'No CMS configured' };
  if (cmsTarget === 'wordpress') {
    cmsResult = await checkWordPress();
  } else if (cmsTarget === 'ghost') {
    cmsResult = await checkGhost();
  }

  // ── Build health report ────────────────────────────────
  const health = {
    openai:    openaiResult,
    pinecone:  pineconeResult,
    cms:       cmsResult,
    cmsTarget,
    checkedAt: new Date().toISOString(),
    allHealthy: openaiResult.healthy && pineconeResult.healthy && cmsResult.healthy,
  };

  // ── Log results ────────────────────────────────────────
  console.log('[workspaceHealthCheck] Results:');
  console.log(`  OpenAI API:  ${openaiResult.healthy  ? '✅ OK' : `❌ FAIL — ${openaiResult.error || `HTTP ${openaiResult.statusCode}`}`}`);
  console.log(`  Pinecone:    ${pineconeResult.healthy ? '✅ OK' : `❌ FAIL — ${pineconeResult.error}`}`);
  console.log(`  CMS (${cmsTarget.padEnd(9)}): ${cmsResult.healthy ? '✅ OK' : `❌ FAIL — ${cmsResult.error || `HTTP ${cmsResult.statusCode}`}`}`);

  if (!health.allHealthy) {
    const failedServices = [];
    if (!openaiResult.healthy)  failedServices.push('OpenAI');
    if (!pineconeResult.healthy) failedServices.push('Pinecone');
    if (!cmsResult.healthy && cmsTarget !== 'none') failedServices.push(`CMS (${cmsTarget})`);

    console.error(`[workspaceHealthCheck] ❌ ${failedServices.length} service(s) failed: ${failedServices.join(', ')}`);

    return {
      workspaceHealth: health,
      graphStatus:     'escalated',
      escalationReason: `Health check failed for: ${failedServices.join(', ')}. Check your API keys and try again.`,
    };
  }

  console.log('[workspaceHealthCheck] ✅ All systems healthy — beginning content generation');

  return {
    workspaceHealth: health,
    graphStatus:     'running',
  };
}
