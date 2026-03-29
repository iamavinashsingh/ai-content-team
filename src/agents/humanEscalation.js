// src/agents/humanEscalation.js
// ============================================================
// Node 26: Human Escalation
//
// Responsibilities:
//  - Triggered when the system encounters unrecoverable failures:
//    * Workspace health check fails (API keys dead)
//    * Outline validation exceeds max retries
//    * Budget exhausted
//    * DALL-E safety rejection loop
//  - Persists a clear escalation reason to DB
//  - Sets graphStatus to 'escalated' (terminal for this run)
//  - The user can then fix the issue and resume or restart
//
// State reads:  escalationReason, workspaceHealth, errors,
//               totalTokensUsed, projectId
// State writes: graphStatus
// ============================================================

import { interrupt } from '@langchain/langgraph';
import { updateProject } from '../database/index.js';

export async function humanEscalationNode(state) {
  const { escalationReason, workspaceHealth, errors, totalTokensUsed, projectId } = state;

  // ── Determine escalation cause ─────────────────────────
  let reason = escalationReason || 'Unknown system error';
  let escalationType = 'unknown';
  let actionableSteps = [];

  // Workspace health failure
  if (workspaceHealth && !workspaceHealth.allHealthy) {
    escalationType = 'service_unavailable';
    const failedServices = [];
    if (!workspaceHealth.openai?.healthy) {
      failedServices.push('OpenAI API');
      actionableSteps.push('Check your OPENAI_API_KEY in settings');
    }
    if (!workspaceHealth.pinecone?.healthy) {
      failedServices.push('Pinecone');
      actionableSteps.push(`Ensure Pinecone index "${process.env.PINECONE_INDEX_NAME}" exists`);
    }
    if (!workspaceHealth.cms?.healthy && workspaceHealth.cmsTarget !== 'none') {
      failedServices.push(`CMS (${workspaceHealth.cmsTarget})`);
      actionableSteps.push('Verify your CMS API credentials in settings');
    }
    reason = `Service health check failed: ${failedServices.join(', ')}`;
  }

  // Budget exhaustion
  if (state.graphStatus === 'paused_budget') {
    escalationType = 'budget_exhausted';
    reason = `Token budget exhausted at ${totalTokensUsed?.toLocaleString()} tokens.`;
    actionableSteps = [
      'Increase MAX_TOKENS_PER_PROJECT in your settings',
      'Or restart with a shorter article brief',
      'You can rollback to a previous snapshot and continue from there',
    ];
  }

  // Recent errors
  if (errors?.length > 0) {
    const recentError = errors[errors.length - 1];
    reason = reason || `System error in ${recentError.node}: ${recentError.error}`;
    escalationType = escalationType || 'system_error';
    actionableSteps = actionableSteps.length > 0 ? actionableSteps : [
      'Check server logs for detailed error information',
      'Try restarting the project from the last snapshot',
    ];
  }

  console.error('[humanEscalation] ⚠️  Graph escalated to human review');
  console.error(`  Type:   ${escalationType}`);
  console.error(`  Reason: ${reason}`);

  // ── Persist escalation to DB ───────────────────────────
  try {
    await updateProject(projectId, { status: 'error', graph_status: 'escalated' });
  } catch (dbErr) {
    console.error('[humanEscalation] Could not update project status:', dbErr.message);
  }

  // ── Build escalation payload for frontend ──────────────
  const escalationPayload = {
    type:            'escalation',
    escalationType,
    reason,
    actionableSteps,
    tokenSpend: {
      used:    totalTokensUsed || 0,
      max:     parseInt(process.env.MAX_TOKENS_PER_PROJECT || '50000', 10),
    },
    snapshots: state.snapshots || [],
    errors:    (errors || []).slice(-5),   // Last 5 errors only
    timestamp: new Date().toISOString(),
  };

  // Interrupt so the API layer can stream this to the frontend
  interrupt(escalationPayload);

  return {
    graphStatus:      'escalated',
    escalationReason: reason,
  };
}
