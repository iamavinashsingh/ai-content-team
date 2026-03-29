// src/agents/brandVoiceExtractor.js
// ============================================================
// Node 19: Brand Voice Extractor ⭐ NEW (V2 Loophole Fix #2)
//
// Responsibilities:
//  - Triggered after the first major section is completed
//  - Analyze the written text to extract exact tone, pacing,
//    formatting patterns, and vocabulary used
//  - Save brandVoicePatterns to state so all future sections
//    sound like the SAME human wrote them
//
// State reads:  draftedSections, taskQueue, brandVoicePatterns
// State writes: brandVoicePatterns
// Model:        GPT-4o-mini (pattern extraction)
//
// Design doc: "Analyzes written text to extract exact tone,
//              pacing, formatting quirks, and vocabulary.
//              Saves to brandVoicePatterns."
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.brandVoiceExtractor;

const VOICE_EXTRACTOR_PROMPT = `You are a writing style analyst.
Analyze the provided article text and extract the author's writing voice and style patterns.

Look for:
- Tone (formal/casual, authoritative/conversational, etc.)
- Pacing (short punchy sentences vs long flowing prose)
- Formatting preferences (bullet points, bold text, paragraph length)
- Vocabulary level and specific word choices
- How the author introduces concepts
- Transition style between ideas

RESPOND WITH VALID JSON ONLY:
{
  "tone": "One phrase describing the overall tone",
  "pacing": "One phrase describing sentence/paragraph rhythm",
  "formattingStyle": "Description of formatting preferences observed",
  "vocabularyPatterns": ["pattern 1", "pattern 2", "pattern 3"],
  "avoidWords": ["word or phrase that would break voice"],
  "sentenceStructure": "Short/Medium/Long/Mixed",
  "voiceSummary": "2-sentence description a writer could use to replicate this voice"
}`;

export async function brandVoiceExtractorNode(state) {
  const { draftedSections, taskQueue, brandVoicePatterns } = state;

  // If brand voice already extracted, skip (it's only extracted once)
  if (brandVoicePatterns) {
    console.log('[brandVoiceExtractor] Brand voice already established — skipping');
    return {};
  }

  // Find the first completed section to analyze
  const completedTasks = taskQueue?.filter((t) => t.status === 'complete') || [];
  if (completedTasks.length === 0) {
    console.log('[brandVoiceExtractor] No completed sections yet — skipping');
    return {};
  }

  // Use the intro section (phase 1) as the voice reference
  // It sets the tone for the entire article
  const introTask = completedTasks.find((t) => t.phase === 1) || completedTasks[0];
  const introSection = draftedSections?.[introTask.sectionId];

  if (!introSection?.rawText) {
    console.warn('[brandVoiceExtractor] No text found for voice analysis');
    return {};
  }

  console.log(`[brandVoiceExtractor] Extracting voice from: "${introSection.heading}"`);

  // Gather all complete section text for a richer sample (up to 1500 words)
  const allCompletedText = completedTasks
    .map((t) => draftedSections?.[t.sectionId]?.rawText || '')
    .join('\n\n')
    .slice(0, 4000);

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.1,
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.default,
  });

  let response;
  try {
    response = await llm.invoke([
      new SystemMessage(VOICE_EXTRACTOR_PROMPT),
      new HumanMessage(`Analyze the writing voice in this article excerpt:\n\n${allCompletedText}`),
    ]);
  } catch (err) {
    console.error('[brandVoiceExtractor] LLM call failed:', err.message);
    return {};
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'brandVoiceExtractor',
    model:        MODEL,
    inputTokens:  response.usage_metadata?.input_tokens  || 0,
    outputTokens: response.usage_metadata?.output_tokens || 0,
  });

  let voiceData;
  try {
    const cleaned = response.content.trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    voiceData = JSON.parse(cleaned);
  } catch {
    console.warn('[brandVoiceExtractor] Could not parse voice data');
    return { ...tokenUpdate };
  }

  console.log(`[brandVoiceExtractor] ✅ Brand voice locked:`);
  console.log(`  Tone:     ${voiceData.tone}`);
  console.log(`  Pacing:   ${voiceData.pacing}`);
  console.log(`  Format:   ${voiceData.formattingStyle}`);
  console.log(`  Summary:  ${voiceData.voiceSummary?.slice(0, 80)}...`);

  return {
    brandVoicePatterns: voiceData,
    ...tokenUpdate,
  };
}
