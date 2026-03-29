// src/agents/presentToUser.js
// ============================================================
// Node 23: Present To User
//
// Responsibilities:
//  - Prepare the assembled document for frontend display
//  - Calculate final token usage and estimated cost
//  - Format a human-readable cost/stats summary
//  - Set graphStatus to 'awaiting_human' so the graph pauses
//    here for the feedbackCollector interrupt
//
// State reads:  assembledDocument, totalTokensUsed,
//               estimatedCostUsd, tokenLog, structuredBrief
// State writes: graphStatus (awaiting_human)
// ============================================================

import { formatBudgetSummary } from '../utils/tokenTracker.js';

export async function presentToUserNode(state) {
  const {
    assembledDocument,
    totalTokensUsed,
    tokenLog,
    structuredBrief,
    outline,
    snapshots,
  } = state;

  if (!assembledDocument) {
    console.error('[presentToUser] No assembled document found');
    return { graphStatus: 'error' };
  }

  // ── Build cost summary ─────────────────────────────────
  const budgetSummary = formatBudgetSummary(
    totalTokensUsed    || 0,
    state.estimatedCostUsd || 0,
    tokenLog           || []
  );

  // ── Build presentation payload ─────────────────────────
  // This gets streamed to the frontend via SSE (Node 28's /stream endpoint)
  const presentationData = {
    type: 'article_ready',

    article: {
      title:       outline.h1,
      markdown:    assembledDocument.markdown,
      wordCount:   assembledDocument.wordCount,
      readingTime: assembledDocument.readingTime,
      sectionCount:assembledDocument.sectionCount,
      mediaCount:  assembledDocument.mediaCount,
      assembledAt: assembledDocument.assembledAt,
    },

    brief: {
      topic:          structuredBrief.topic,
      targetAudience: structuredBrief.targetAudience,
      tone:           structuredBrief.tone,
      seoKeywords:    structuredBrief.seoKeywords,
      cmsTarget:      structuredBrief.cmsTarget,
    },

    cost: budgetSummary,

    snapshots: (snapshots || []).map((s) => ({
      version:   s.version,
      label:     s.label,
      sectionId: s.sectionId,
      savedAt:   s.savedAt,
    })),
  };

  console.log('[presentToUser] Article ready for review:');
  console.log(`  Title:     "${outline.h1}"`);
  console.log(`  Words:     ${assembledDocument.wordCount.toLocaleString()}`);
  console.log(`  Tokens:    ${totalTokensUsed?.toLocaleString() || 0} (${budgetSummary.percentOfBudget}% of budget)`);
  console.log(`  Est. Cost: $${budgetSummary.totalCostUsd?.toFixed(4) || '0.0000'}`);
  console.log('[presentToUser] Pausing for user review...');

  return {
    graphStatus:      'awaiting_human',
    presentationData, // Stored in state for the API to stream to frontend
  };
}
