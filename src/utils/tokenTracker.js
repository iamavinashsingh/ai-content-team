// src/utils/tokenTracker.js
// ============================================================
// Token Budget Tracker
//
// Tracks token consumption per agent call, calculates USD cost,
// enforces hard limits, and emits warnings at the soft threshold.
//
// Design doc ref: Section 9 — Token Budgeting & Cost Analysis
// ── Loophole fix #8: Runaway API Costs ────────────────────
// ============================================================

import { TOKEN_BUDGET, MODELS } from '../config/index.js';
import { logTokenEvent } from '../database/index.js';

// ── OpenAI Pricing (per 1M tokens, March 2026 pricing) ───
// Update these if OpenAI changes pricing
const PRICING = {
  [MODELS.SMART]: {
    input:  2.50 / 1_000_000,   // $2.50 per 1M input tokens
    output: 10.00 / 1_000_000,  // $10.00 per 1M output tokens
  },
  [MODELS.FAST]: {
    input:  0.15 / 1_000_000,   // $0.15 per 1M input tokens
    output: 0.60 / 1_000_000,   // $0.60 per 1M output tokens
  },
  'text-embedding-3-small': {
    input:  0.02 / 1_000_000,
    output: 0,
  },
  [MODELS.IMAGE]: {
    // DALL-E 3: flat rate per image, not token-based
    perImage: {
      standard_1024: 0.040,
      hd_1024:       0.080,
    },
  },
};

// ── Calculate cost for a text generation call ─────────────
export function calculateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model];
  if (!pricing || !pricing.input) return 0;

  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

// ── Calculate cost for a DALL-E image ────────────────────
export function calculateImageCost(quality = 'standard') {
  const key = `${quality}_1024`;
  return PRICING[MODELS.IMAGE]?.perImage?.[key] || 0.040;
}

// ── Check if project is within budget ─────────────────────
// Returns: { allowed: bool, reason: string | null, budgetStatus: obj }
export function checkBudget(currentTokens, tokensToAdd = 0) {
  const projected = currentTokens + tokensToAdd;
  const max = TOKEN_BUDGET.MAX_PER_PROJECT;
  const warnAt = TOKEN_BUDGET.WARN_THRESHOLD;

  if (projected >= max) {
    return {
      allowed: false,
      reason: `Token budget exhausted. Used: ${currentTokens.toLocaleString()} / ${max.toLocaleString()} tokens. Project auto-paused.`,
      budgetStatus: {
        current: currentTokens,
        max,
        percentUsed: Math.round((currentTokens / max) * 100),
        exhausted: true,
      },
    };
  }

  if (projected >= warnAt) {
    return {
      allowed: true,
      reason: `⚠️ Token warning: ${projected.toLocaleString()} / ${max.toLocaleString()} tokens used (${Math.round((projected / max) * 100)}%).`,
      budgetStatus: {
        current: projected,
        max,
        percentUsed: Math.round((projected / max) * 100),
        warning: true,
      },
    };
  }

  return {
    allowed: true,
    reason: null,
    budgetStatus: {
      current: projected,
      max,
      percentUsed: Math.round((projected / max) * 100),
    },
  };
}

// ── Track a completed LLM call ─────────────────────────────
// Called by every agent after each OpenAI API call.
// Returns the state update fragment for tokenLog and totalTokensUsed.
//
// Usage in an agent:
//   const { stateUpdate } = await trackTokenUsage({
//     projectId: state.projectId,
//     agentName: 'writerAgent',
//     model: AGENT_MODEL_MAP.writerAgent,
//     inputTokens: response.usage.prompt_tokens,
//     outputTokens: response.usage.completion_tokens,
//   });
//   return { ...myUpdates, ...stateUpdate };
export async function trackTokenUsage({
  projectId,
  agentName,
  model,
  inputTokens,
  outputTokens,
  isImage = false,
  imageQuality = 'standard',
}) {
  const totalTokens = inputTokens + outputTokens;
  const costUsd = isImage
    ? calculateImageCost(imageQuality)
    : calculateCost(model, inputTokens, outputTokens);

  // Persist to DB (non-blocking — we don't await in the critical path)
  logTokenEvent({ projectId, agentName, model, tokensUsed: totalTokens, costUsd })
    .catch((err) => console.error('[TokenTracker] DB log failed:', err.message));

  const logEntry = {
    agent:     agentName,
    tokens:    totalTokens,
    model,
    costUsd,
    timestamp: new Date().toISOString(),
  };

  console.log(
    `[Tokens] ${agentName} | ${model} | in:${inputTokens} out:${outputTokens} | $${costUsd.toFixed(6)}`
  );

  // Return the state update fragment — spread this into your node's return object
  return {
    stateUpdate: {
      totalTokensUsed: totalTokens,  // Accumulator reducer will add this
      tokenLog: [logEntry],          // Append reducer will add this
      estimatedCostUsd: costUsd,     // This is NOT accumulated — use DB for total
    },
  };
}

// ── Format budget summary for UI ──────────────────────────
// Used by presentToUser node
export function formatBudgetSummary(totalTokensUsed, estimatedCostUsd, tokenLog) {
  const byAgent = {};
  for (const entry of tokenLog) {
    if (!byAgent[entry.agent]) {
      byAgent[entry.agent] = { tokens: 0, cost: 0, calls: 0 };
    }
    byAgent[entry.agent].tokens += entry.tokens;
    byAgent[entry.agent].cost   += entry.costUsd;
    byAgent[entry.agent].calls  += 1;
  }

  return {
    totalTokens:    totalTokensUsed,
    totalCostUsd:   estimatedCostUsd,
    percentOfBudget: Math.round((totalTokensUsed / TOKEN_BUDGET.MAX_PER_PROJECT) * 100),
    breakdown: Object.entries(byAgent)
      .sort(([, a], [, b]) => b.tokens - a.tokens)
      .map(([agent, data]) => ({
        agent,
        tokens: data.tokens,
        cost:   `$${data.cost.toFixed(4)}`,
        calls:  data.calls,
      })),
  };
}
