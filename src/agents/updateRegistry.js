// src/agents/updateRegistry.js
// ============================================================
// Node 13: Update Registry
//
// Responsibilities:
//  - For each just-drafted section, extract a 2-sentence summary
//  - Store it in the sectionRegistry to prevent future sections
//    repeating the same information
//  - Also tracks keywords already used
//
// State reads:  draftedSections, activeTaskIds, taskQueue
// State writes: sectionRegistry
// Model:        GPT-4o-mini (simple summarization)
//
// Design doc: "Extracts a 2-sentence summary of what was just
//              written and updates the Document State Registry
//              so future sections know what was already covered."
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.updateRegistry;

const REGISTRY_SYSTEM_PROMPT = `You are a document summarizer. 
Given a section of an article, extract:
1. A 2-sentence summary of what was covered
2. The key claims or facts stated
3. The main keywords/concepts used

RESPOND WITH VALID JSON ONLY:
{
  "summary": "Two sentence summary of what this section covered.",
  "keyClaims": ["claim 1", "claim 2"],
  "keywordsUsed": ["kw1", "kw2", "kw3"]
}`;

export async function updateRegistryNode(state) {
  const { draftedSections, activeTaskIds, taskQueue } = state;

  if (!activeTaskIds?.length) return {};

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.1,
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.default,
  });

  const registryUpdates = {};
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;

  for (const taskId of activeTaskIds) {
    const task = taskQueue?.find((t) => t.taskId === taskId);
    if (!task) continue;

    const drafted = draftedSections?.[task.sectionId];
    if (!drafted) continue;

    try {
      const response = await llm.invoke([
        new SystemMessage(REGISTRY_SYSTEM_PROMPT),
        new HumanMessage(`Section heading: "${drafted.heading}"\n\nSection text:\n${drafted.rawText.slice(0, 1500)}`),
      ]);

      totalInputTokens  += response.usage_metadata?.input_tokens  || 0;
      totalOutputTokens += response.usage_metadata?.output_tokens || 0;

      let parsed;
      try {
        const cleaned = response.content.trim()
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback: use first 200 chars as summary
        parsed = {
          summary:      drafted.rawText.slice(0, 200) + '...',
          keyClaims:    [],
          keywordsUsed: [],
        };
      }

      registryUpdates[task.sectionId] = {
        summary:      parsed.summary,
        keyClaims:    parsed.keyClaims || [],
        keywordsUsed: parsed.keywordsUsed || [],
        completedAt:  new Date().toISOString(),
      };

      console.log(`[updateRegistry] [${task.sectionId}] Registered: "${parsed.summary.slice(0, 80)}..."`);
    } catch (err) {
      console.warn(`[updateRegistry] Failed for ${task.sectionId}: ${err.message}`);
    }
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'updateRegistry',
    model:        MODEL,
    inputTokens:  totalInputTokens,
    outputTokens: totalOutputTokens,
  });

  return {
    sectionRegistry: registryUpdates,   // Deep-merge reducer in state
    ...tokenUpdate,
  };
}
