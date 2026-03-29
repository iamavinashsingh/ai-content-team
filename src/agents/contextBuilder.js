// src/agents/contextBuilder.js
// ============================================================
// Node 11: Context Builder
//
// Responsibilities:
//  - For each active task, query Pinecone for ONLY the research
//    relevant to that specific section heading (RAG per-section)
//  - Pull brandVoicePatterns if available (post phase 1)
//  - Pull the section_registry summary to prevent repetition
//  - Assemble a tight ~1500 token context package
//
// State reads:  activeTaskIds, taskQueue, outline, sectionRegistry,
//               brandVoicePatterns, projectId
// State writes: currentContext
//
// Design doc: "Queries Pinecone for specific research only
//              relevant to the current section heading.
//              Pulls brandVoicePatterns. Output: ~1500 tokens."
// ============================================================

import { queryResearchForSection } from '../vector/index.js';
import { TOKEN_BUDGET } from '../config/index.js';

// Rough token estimator (4 chars ≈ 1 token)
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// Trim research chunks to stay within token budget
function trimToTokenBudget(chunks, maxTokens) {
  const selected = [];
  let usedTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.textChunk);
    if (usedTokens + chunkTokens > maxTokens) break;
    selected.push(chunk);
    usedTokens += chunkTokens;
  }

  return selected;
}

export async function contextBuilderNode(state) {
  const {
    activeTaskIds,
    taskQueue,
    outline,
    sectionRegistry,
    brandVoicePatterns,
    projectId,
  } = state;

  if (!activeTaskIds || activeTaskIds.length === 0) {
    console.warn('[contextBuilder] No active tasks — skipping context build');
    return { currentContext: null };
  }

  // For parallel tasks, build a combined context
  // Each task gets its own research, but they share registry + voice
  const activeTasks = taskQueue.filter((t) => activeTaskIds.includes(t.taskId));
  console.log(`[contextBuilder] Building context for ${activeTasks.length} section(s)...`);

  const sectionContexts = [];

  for (const task of activeTasks) {
    // ── RAG: Fetch relevant research for this section ────
    // Token budget per section: split total budget across active tasks
    const researchBudget = Math.floor(
      TOKEN_BUDGET.CONTEXT_PER_SECTION / activeTasks.length
    );

    let researchChunks = [];
    try {
      const rawChunks = await queryResearchForSection(task.heading, projectId, 8);
      researchChunks = trimToTokenBudget(rawChunks, researchBudget);
      console.log(`[contextBuilder]   [${task.sectionId}] Retrieved ${researchChunks.length} research chunks (score ≥ ${researchChunks[0]?.score?.toFixed(2) || 'N/A'})`);
    } catch (err) {
      console.warn(`[contextBuilder]   RAG query failed for "${task.heading}": ${err.message}`);
    }

    // ── Get the full section outline details ─────────────
    const sectionOutline = outline.sections.find((s) => s.id === task.sectionId) || task;

    sectionContexts.push({
      taskId:         task.taskId,
      sectionId:      task.sectionId,
      sectionOutline: {
        heading:        sectionOutline.heading,
        level:          sectionOutline.level,
        targetWordCount:sectionOutline.targetWordCount,
        keywords:       sectionOutline.keywords || [],
        purpose:        sectionOutline.purpose || '',
        requiresMedia:  sectionOutline.requiresMedia || false,
      },
      researchChunks: researchChunks.map((c) => ({
        text:      c.textChunk,
        source:    c.sourceUrl,
        relevance: c.score,
      })),
    });
  }

  // ── Build registry summary (prevents section repetition) ─
  const registryEntries = Object.entries(sectionRegistry || {});
  const registrySummary = registryEntries.length > 0
    ? registryEntries
        .map(([id, entry]) => `[${id}] ${entry.summary}`)
        .join('\n')
    : 'No sections written yet — this is the first section.';

  // ── Full context package ───────────────────────────────
  const contextPackage = {
    sections:        sectionContexts,
    registrySummary,
    brandVoice:      brandVoicePatterns || null,
    articleH1:       outline.h1,
    totalSections:   outline.sections.length,
    activeSectionIds:activeTaskIds,
  };

  // Log token estimate
  const packageJson = JSON.stringify(contextPackage);
  const estimatedTokens = estimateTokens(packageJson);
  console.log(`[contextBuilder] Context package assembled (~${estimatedTokens} tokens)`);

  return { currentContext: contextPackage };
}
