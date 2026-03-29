// src/agents/writerAgent.js
// ============================================================
// Node 12: Writer Agent
//
// Responsibilities:
//  - Use GPT-4o to draft each section using the context package
//  - Apply brand voice patterns if available
//  - Ground writing in the research chunks from Pinecone
//  - Meet target word count and include assigned SEO keywords
//  - Handle rewrite requests from editorAgent or factCheckValidator
//
// State reads:  currentContext, structuredBrief, draftedSections,
//               lastEditorFeedback, detectedHallucinations,
//               activeTaskIds
// State writes: draftedSections, taskQueue (status updates)
// Model:        GPT-4o (highest quality — core writing task)
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.writerAgent;

// ── Build system prompt ────────────────────────────────────
function buildSystemPrompt(brief, brandVoice) {
  let prompt = `You are an expert content writer producing a ${brief.contentType} article.

Article Details:
- Title: ${brief.title}
- Audience: ${brief.targetAudience}
- Tone: ${brief.tone}
- Angle: ${brief.angle}

Writing Rules:
1. Write ONLY the section assigned — not the full article
2. Hit the target word count (within ±10%)
3. Naturally use the assigned SEO keywords (no keyword stuffing)
4. Ground all facts and statistics in the provided research
5. Do NOT invent statistics, quotes, or studies not in the research
6. Use clear transitions that connect to the document context
7. Format in clean Markdown (use ## for H2, ### for H3, **bold**, bullet lists where appropriate)
8. Do NOT include a heading in your output — the heading is handled separately`;

  // Inject brand voice if we have it (post-first-section)
  if (brandVoice) {
    prompt += `\n\nBrand Voice Rules (CRITICAL — match this exactly):
- Tone: ${brandVoice.tone}
- Pacing: ${brandVoice.pacing}
- Formatting style: ${brandVoice.formattingStyle}
- Vocabulary patterns: ${brandVoice.vocabularyPatterns?.join(', ') || 'natural language'}
- Words to avoid: ${brandVoice.avoidWords?.join(', ') || 'none specified'}`;
  }

  return prompt;
}

// ── Build user prompt for a single section ─────────────────
function buildSectionPrompt(sectionCtx, registrySummary, isRewrite, editorFeedback, hallucinations) {
  const { sectionOutline, researchChunks } = sectionCtx;

  let prompt = `Write the "${sectionOutline.heading}" section.

Section Specs:
- Target word count: ${sectionOutline.targetWordCount} words
- Level: H${sectionOutline.level}
- Purpose: ${sectionOutline.purpose}
- Required keywords: ${sectionOutline.keywords.join(', ')}

What the article has covered so far:
${registrySummary}

Research to draw from (use these facts, cite where natural):
${researchChunks.length > 0
  ? researchChunks.map((c, i) => `[Source ${i + 1}] ${c.text}`).join('\n\n')
  : 'No specific research retrieved — write from general knowledge for this section.'}`;

  // Rewrite mode: include editor feedback
  if (isRewrite && editorFeedback) {
    prompt += `\n\nREWRITE INSTRUCTIONS (previous draft was rejected):
Issues to fix:
${editorFeedback.issues?.map((i) => `- ${i}`).join('\n') || 'General quality issues'}

Keep what worked, fix only the problems listed above.`;
  }

  // Fact-check rewrite mode: include hallucination corrections
  if (hallucinations && hallucinations.length > 0) {
    const sectionHallucinations = hallucinations.filter(
      (h) => h.sectionId === sectionCtx.sectionId
    );
    if (sectionHallucinations.length > 0) {
      prompt += `\n\nFACT CORRECTION REQUIRED:
The following claims could not be verified against research. Remove or correct them:
${sectionHallucinations.map((h) => `- "${h.claim}" (closest evidence: ${h.closestEvidence || 'none found'})`).join('\n')}`;
    }
  }

  return prompt;
}

export async function writerAgentNode(state) {
  const {
    currentContext,
    structuredBrief,
    activeTaskIds,
    lastEditorFeedback,
    detectedHallucinations,
  } = state;

  if (!currentContext || !activeTaskIds?.length) {
    console.warn('[writerAgent] No context or active tasks');
    return {};
  }

  const isRewrite = !!(lastEditorFeedback?.verdict === 'rejected' || detectedHallucinations?.length > 0);
  if (isRewrite) {
    console.log('[writerAgent] Rewrite mode — incorporating feedback/corrections');
  }

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.7,   // Slightly higher for natural prose variation
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.writerAgent,
  });

  const systemPrompt = buildSystemPrompt(structuredBrief, currentContext.brandVoice);

  const newDraftedSections = {};
  const updatedTaskQueue   = [...(state.taskQueue || [])];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;

  // Write each active section
  // For parallel tasks this loops, for sequential it runs once
  for (const sectionCtx of currentContext.sections) {
    if (!activeTaskIds.includes(sectionCtx.taskId)) continue;

    console.log(`[writerAgent] Drafting: "${sectionCtx.sectionOutline.heading}" (~${sectionCtx.sectionOutline.targetWordCount}w)`);

    const userPrompt = buildSectionPrompt(
      sectionCtx,
      currentContext.registrySummary,
      isRewrite,
      lastEditorFeedback,
      detectedHallucinations,
    );

    let response;
    try {
      response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);
    } catch (err) {
      console.error(`[writerAgent] LLM call failed for "${sectionCtx.sectionOutline.heading}":`, err.message);
      return {
        errors: [{ node: 'writerAgent', error: err.message, timestamp: new Date().toISOString() }],
        graphStatus: 'error',
      };
    }

    totalInputTokens  += response.usage_metadata?.input_tokens  || 0;
    totalOutputTokens += response.usage_metadata?.output_tokens || 0;

    const draftText = response.content.trim();
    const wordCount = draftText.split(/\s+/).length;
    console.log(`[writerAgent]   ✓ "${sectionCtx.sectionOutline.heading}" — ${wordCount} words`);

    // Store drafted section
    newDraftedSections[sectionCtx.sectionId] = {
      rawText:    draftText,
      heading:    sectionCtx.sectionOutline.heading,
      level:      sectionCtx.sectionOutline.level,
      wordCount,
      status:     'drafted',
      version:    (state.draftedSections?.[sectionCtx.sectionId]?.version || 0) + 1,
      draftedAt:  new Date().toISOString(),
    };

    // Update task status in queue
    const taskIdx = updatedTaskQueue.findIndex((t) => t.taskId === sectionCtx.taskId);
    if (taskIdx !== -1) {
      updatedTaskQueue[taskIdx] = { ...updatedTaskQueue[taskIdx], status: 'drafted' };
    }
  }

  // Track combined token usage for all sections in this call
  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'writerAgent',
    model:        MODEL,
    inputTokens:  totalInputTokens,
    outputTokens: totalOutputTokens,
  });

  // Clear hallucinations for sections we just rewrote
  const remainingHallucinations = (detectedHallucinations || []).filter(
    (h) => !activeTaskIds.some((id) => {
      const task = state.taskQueue?.find((t) => t.taskId === id);
      return task?.sectionId === h.sectionId;
    })
  );

  return {
    draftedSections:      newDraftedSections,
    taskQueue:            updatedTaskQueue,
    detectedHallucinations: remainingHallucinations,
    lastEditorFeedback:   null,  // Clear previous feedback
    ...tokenUpdate,
  };
}
