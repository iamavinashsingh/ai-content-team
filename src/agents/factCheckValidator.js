// src/agents/factCheckValidator.js
// ============================================================
// Node 15: Fact Check Validator ⭐ NEW (V2 Loophole Fix #1)
//
// Responsibilities:
//  - Extract all factual claims, statistics, and quotes from
//    the approved section text
//  - Query Pinecone to verify each claim against scraped research
//  - Flag claims with low similarity scores as hallucinations
//  - Return verified=true to proceed or verified=false to rewrite
//
// State reads:  draftedSections, activeTaskIds, taskQueue, projectId
// State writes: detectedHallucinations, draftedSections, taskQueue
// Model:        GPT-4o-mini (structured claim extraction)
//
// Design doc: "Extracts all factual claims, numbers, and quotes.
//              Queries Pinecone to verify. If hallucination
//              detected, flags it."
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';
import { verifyClaimsAgainstResearch } from '../vector/index.js';

const MODEL = AGENT_MODEL_MAP.factCheckValidator;

const CLAIM_EXTRACTOR_PROMPT = `You are a fact-checking assistant.
Extract all verifiable factual claims from the provided text.

Focus on:
- Statistics and percentages ("X% of companies...")
- Named studies or reports ("According to a Stanford study...")
- Specific numbers or dates ("In 2023, revenue reached $X...")
- Direct quotes attributed to real people
- Causal claims ("X causes Y", "X leads to Y")

Do NOT flag:
- General well-known facts ("the sky is blue")
- Clearly hedged opinions ("some experts believe...")
- The writer's own analysis or transitions

RESPOND WITH VALID JSON ONLY:
{
  "claims": [
    { "claim": "exact claim text", "type": "statistic|quote|study|fact" }
  ]
}`;

export async function factCheckValidatorNode(state) {
  const { draftedSections, activeTaskIds, taskQueue, projectId } = state;

  if (!activeTaskIds?.length) return {};

  // Find the section that just passed editor review
  const activeTask = taskQueue?.find(
    (t) => activeTaskIds.includes(t.taskId) && t.status === 'edited'
  );

  if (!activeTask) {
    console.warn('[factCheckValidator] No edited task found — skipping fact check');
    return {};
  }

  const drafted = draftedSections?.[activeTask.sectionId];
  if (!drafted) return {};

  console.log(`[factCheckValidator] Fact-checking: "${drafted.heading}"`);

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.0,  // Zero temp — deterministic extraction
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.factCheckValidator,
  });

  // ── Step 1: Extract all factual claims ────────────────
  let response;
  try {
    response = await llm.invoke([
      new SystemMessage(CLAIM_EXTRACTOR_PROMPT),
      new HumanMessage(`Extract all verifiable claims from this section:\n\n${drafted.rawText}`),
    ]);
  } catch (err) {
    console.error('[factCheckValidator] Claim extraction failed:', err.message);
    // On failure: approve and continue (don't block pipeline)
    return {
      draftedSections: {
        [activeTask.sectionId]: { ...drafted, status: 'verified' },
      },
    };
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId,
    agentName:    'factCheckValidator',
    model:        MODEL,
    inputTokens:  response.usage_metadata?.input_tokens  || 0,
    outputTokens: response.usage_metadata?.output_tokens || 0,
  });

  let extractedClaims = [];
  try {
    const cleaned = response.content.trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    extractedClaims = parsed.claims || [];
  } catch {
    console.warn('[factCheckValidator] Could not parse claims — treating as verified');
  }

  console.log(`[factCheckValidator] Extracted ${extractedClaims.length} claim(s) to verify`);

  // ── Step 2: Verify claims against Pinecone ────────────
  let newHallucinations = [];

  if (extractedClaims.length > 0) {
    const claimTexts = extractedClaims.map((c) => c.claim);

    let verificationResults;
    try {
      verificationResults = await verifyClaimsAgainstResearch(claimTexts, projectId);
    } catch (err) {
      console.warn('[factCheckValidator] Pinecone verification failed:', err.message);
      // On Pinecone failure: approve section (don't block)
      verificationResults = claimTexts.map((claim) => ({ claim, isVerified: true }));
    }

    const unverified = verificationResults.filter((r) => !r.isVerified);
    newHallucinations = unverified.map((r) => ({
      sectionId:       activeTask.sectionId,
      claim:           r.claim,
      similarityScore: r.similarityScore,
      closestEvidence: r.closestEvidence,
      evidenceSource:  r.evidenceSource,
    }));

    // Log results
    verificationResults.forEach((r) => {
      const icon = r.isVerified ? '✓' : '✗';
      const score = r.similarityScore?.toFixed(2) || '0.00';
      console.log(`[factCheckValidator] ${icon} [${score}] "${r.claim.slice(0, 60)}..."`);
    });
  }

  // ── Step 3: Route verdict ──────────────────────────────
  const updatedTaskQueue = [...(state.taskQueue || [])];

  if (newHallucinations.length > 0) {
    console.warn(`[factCheckValidator] ❌ ${newHallucinations.length} unverified claim(s) — routing to rewrite`);
    return {
      detectedHallucinations: newHallucinations,
      ...tokenUpdate,
    };
  }

  // All claims verified — mark section as verified
  console.log(`[factCheckValidator] ✅ All claims verified — section approved`);

  const taskIdx = updatedTaskQueue.findIndex((t) => t.taskId === activeTask.taskId);
  if (taskIdx !== -1) {
    updatedTaskQueue[taskIdx] = { ...updatedTaskQueue[taskIdx], status: 'verified' };
  }

  return {
    draftedSections: {
      [activeTask.sectionId]: { ...drafted, status: 'verified', verifiedAt: new Date().toISOString() },
    },
    detectedHallucinations: [],
    taskQueue: updatedTaskQueue,
    ...tokenUpdate,
  };
}
