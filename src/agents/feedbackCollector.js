// src/agents/feedbackCollector.js
// ============================================================
// Node 24: Feedback Collector (Interrupt Node)
//
// Responsibilities:
//  - Pause the graph and wait for user review
//  - Accept structured feedback: typos, rewrites, new sections
//  - Calculate scopeDrift score (0.0 = on-brief, 1.0 = total rewrite)
//  - Route to publisher if satisfied, or feedbackRouter if not
//
// State reads:  assembledDocument, structuredBrief
// State writes: userFeedback, scopeDrift, graphStatus
//
// Design doc: "Collects user feedback. Calculates scopeDrift.
//              { typos, rewrites, scopeDrift: 0.0-1.0 }"
// ============================================================

import { interrupt } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.feedbackRouter;

// ── Scope drift calculator ─────────────────────────────────
// Measures how far the requested changes deviate from the original brief
async function calculateScopeDrift(originalBrief, feedback, llm) {
  if (!feedback || feedback.satisfied) return 0.0;

  const hasNewSections = feedback.newSections?.length > 0;
  const hasRewrites    = feedback.rewrites?.length > 0;
  const hasTypos       = feedback.typos?.length > 0;

  // Quick heuristic — skip LLM for trivial feedback
  if (hasTypos && !hasRewrites && !hasNewSections) return 0.05;
  if (!hasRewrites && !hasNewSections) return 0.1;

  try {
    const response = await llm.invoke([
      new SystemMessage(`You are evaluating how much a user's feedback deviates from the original content brief.
Score from 0.0 (perfectly on-brief, just typos) to 1.0 (completely different article requested).
0.0-0.2 = Minor edits (typos, tone tweaks)
0.2-0.5 = Moderate changes (section rewrites, angle shift)
0.5-0.8 = Major changes (new sections, topic expansion)
0.8-1.0 = Fundamental scope change (different audience, topic, purpose)
RESPOND WITH A SINGLE DECIMAL NUMBER ONLY. Example: 0.35`),
      new HumanMessage(
        `Original brief topic: ${originalBrief.topic}\n` +
        `Original angle: ${originalBrief.angle}\n` +
        `Original audience: ${originalBrief.targetAudience}\n\n` +
        `User feedback:\n` +
        `Rewrites requested: ${feedback.rewrites?.join(', ') || 'none'}\n` +
        `New sections requested: ${feedback.newSections?.join(', ') || 'none'}\n` +
        `Comments: ${feedback.comments || 'none'}`
      ),
    ]);

    const score = parseFloat(response.content.trim());
    return isNaN(score) ? 0.3 : Math.min(1.0, Math.max(0.0, score));
  } catch {
    return 0.3;  // Default moderate drift on failure
  }
}

export async function feedbackCollectorNode(state) {
  console.log('[feedbackCollector] Graph paused — waiting for user review');

  // ── interrupt() pauses graph execution ────────────────
  // The API layer streams presentationData to the frontend,
  // user reviews, submits feedback, and the API resumes the graph.
  //
  // Expected resume payload shape:
  // {
  //   satisfied: boolean,
  //   typos: ["section_id: fix description"],
  //   rewrites: ["section_id: rewrite instructions"],
  //   newSections: ["New section topic to add"],
  //   comments: "General feedback string"
  // }
  const humanFeedback = interrupt({
    type:    'review_article',
    message: 'Please review the article and submit your feedback.',
    article: {
      title:     state.outline?.h1,
      wordCount: state.assembledDocument?.wordCount,
    },
  });

  // ── Normalize the feedback ─────────────────────────────
  let feedback;
  if (typeof humanFeedback === 'string') {
    // User typed free text — treat as general comment
    feedback = {
      satisfied:   humanFeedback.toLowerCase().includes('approve') ||
                   humanFeedback.toLowerCase().includes('publish'),
      typos:       [],
      rewrites:    [],
      newSections: [],
      comments:    humanFeedback,
    };
  } else {
    feedback = {
      satisfied:   humanFeedback?.satisfied ?? false,
      typos:       humanFeedback?.typos       || [],
      rewrites:    humanFeedback?.rewrites     || [],
      newSections: humanFeedback?.newSections  || [],
      comments:    humanFeedback?.comments     || '',
    };
  }

  console.log('[feedbackCollector] Feedback received:');
  console.log(`  Satisfied:    ${feedback.satisfied}`);
  console.log(`  Typos:        ${feedback.typos.length}`);
  console.log(`  Rewrites:     ${feedback.rewrites.length}`);
  console.log(`  New sections: ${feedback.newSections.length}`);

  if (feedback.satisfied) {
    console.log('[feedbackCollector] User approved — routing to publisher');
    return {
      userFeedback: feedback,
      scopeDrift:   0.0,
      graphStatus:  'running',
    };
  }

  // ── Calculate scope drift ──────────────────────────────
  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.0,
    maxTokens:   50,
  });

  const drift = await calculateScopeDrift(state.structuredBrief, feedback, llm);

  await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'feedbackCollector',
    model:        MODEL,
    inputTokens:  50,
    outputTokens: 5,
  });

  console.log(`[feedbackCollector] Scope drift score: ${drift.toFixed(2)} — routing to feedbackRouter`);

  return {
    userFeedback: feedback,
    scopeDrift:   drift,
    graphStatus:  'running',
  };
}
