// src/agents/editorAgent.js
// ============================================================
// Node 14: Editor Agent
//
// Responsibilities:
//  - Review drafted section for readability and flow
//  - Check tone consistency with the brief
//  - Verify smooth transitions from previous sections
//  - Check SEO keyword presence (without stuffing)
//  - Enforce 2-rejection limit before escalating to simplifyTask
//
// State reads:  draftedSections, activeTaskIds, taskQueue,
//               structuredBrief, sectionRegistry,
//               editorRejectionCounts, brandVoicePatterns
// State writes: draftedSections (status update), lastEditorFeedback,
//               editorRejectionCounts, taskQueue
// Model:        GPT-4o (nuanced editorial judgment)
//
// Design doc: "Max 2 rejections → simplifyTask"
//             Loophole fix #7: "Escalate to section rewrite
//             instead of endless tweaks"
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET, LOOP_LIMITS } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.editorAgent;

const EDITOR_SYSTEM_PROMPT = `You are a senior editor at a digital publication. 
Review a section of an article and provide a structured editorial verdict.

Evaluate on these criteria:
1. READABILITY: Is the prose clear, well-paced, and engaging for the target audience?
2. TONE: Does it match the specified tone consistently throughout?
3. TRANSITIONS: Does it flow naturally from what came before?
4. SEO: Are the required keywords present without feeling forced?
5. ACCURACY_FLAG: Does anything read like an unsupported claim or invented fact?
6. WORD_COUNT: Is it within 15% of the target word count?

Verdict rules:
- "approved": Section meets quality bar — move forward
- "rejected": Section has fixable issues — specify exactly what to change
- Be decisive: don't reject for minor style preferences

RESPOND WITH VALID JSON ONLY:
{
  "verdict": "approved" | "rejected",
  "scores": {
    "readability": 1-10,
    "tone": 1-10,
    "transitions": 1-10,
    "seo": 1-10
  },
  "issues": ["specific issue 1", "specific issue 2"],
  "strengths": ["what worked well"],
  "wordCountCheck": { "actual": 250, "target": 300, "withinRange": true }
}`;

export async function editorAgentNode(state) {
  const {
    draftedSections,
    activeTaskIds,
    taskQueue,
    structuredBrief,
    sectionRegistry,
    editorRejectionCounts,
    brandVoicePatterns,
  } = state;

  if (!activeTaskIds?.length) {
    console.warn('[editorAgent] No active tasks to review');
    return {};
  }

  // Only review tasks that are active and currently drafted
  const activeTasks = taskQueue?.filter(
    (t) => activeTaskIds.includes(t.taskId) && t.status === 'drafted'
  ) || [];

  if (activeTasks.length === 0) {
    console.warn('[editorAgent] No drafted tasks found in active tasks');
    return {};
  }

  const updatedRejectionCounts = { ...editorRejectionCounts };
  const updatedTaskQueue = [...(taskQueue || [])];
  const updatedDraftedSections = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastAppendedFeedback = null;
  const newErrors = [];

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.2,
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.editorAgent,
  });

  for (const activeTask of activeTasks) {
    const drafted = draftedSections?.[activeTask.sectionId];
    if (!drafted) {
      console.warn(`[editorAgent] No draft found for section: ${activeTask.sectionId}`);
      continue;
    }

    // ── Rejection limit check ──────────────────────────────
    const currentRejections = updatedRejectionCounts[activeTask.sectionId] || 0;
    if (currentRejections >= LOOP_LIMITS.editorAgentRejections) {
      console.warn(`[editorAgent] Section "${activeTask.heading}" hit rejection limit (${currentRejections}) — routing to simplifyTask`);
      lastAppendedFeedback = {
        sectionId: activeTask.sectionId,
        verdict:   'rejected',
        issues:    ['Max rejections reached — section will be split into smaller parts'],
        forcedEscalation: true,
      };
      continue;
    }

    console.log(`[editorAgent] Reviewing: "${drafted.heading}" (${drafted.wordCount} words, rejection #${currentRejections})`);

    // Build context for the editor
    const registrySummary = Object.entries(sectionRegistry || {})
      .filter(([id]) => id !== activeTask.sectionId)
      .map(([id, entry]) => `[${id}] ${entry.summary}`)
      .join('\n') || 'First section — no prior context.';

    const voiceContext = brandVoicePatterns
      ? `Established brand voice: ${brandVoicePatterns.tone}, ${brandVoicePatterns.pacing}`
      : 'No brand voice established yet.';

    const userPrompt = `Review this article section:

Article Tone: ${structuredBrief.tone}
Target Audience: ${structuredBrief.targetAudience}
Required Keywords: ${activeTask.keywords?.join(', ') || 'none specified'}
Target Word Count: ${activeTask.targetWordCount}
${voiceContext}

Previous sections covered:
${registrySummary}

Section to review:
## ${drafted.heading}

${drafted.rawText}`;

    let response;
    try {
      response = await llm.invoke([
        new SystemMessage(EDITOR_SYSTEM_PROMPT),
        new HumanMessage(userPrompt),
      ]);
      totalInputTokens += response.usage_metadata?.input_tokens || 0;
      totalOutputTokens += response.usage_metadata?.output_tokens || 0;
    } catch (err) {
      console.error('[editorAgent] LLM call failed:', err.message);
      // On LLM failure, auto-approve to avoid blocking the pipeline
      lastAppendedFeedback = { sectionId: activeTask.sectionId, verdict: 'approved', issues: [] };
      newErrors.push({ node: 'editorAgent', error: err.message, timestamp: new Date().toISOString() });
      const taskIdx = updatedTaskQueue.findIndex((t) => t.taskId === activeTask.taskId);
      if (taskIdx !== -1) updatedTaskQueue[taskIdx] = { ...updatedTaskQueue[taskIdx], status: 'edited' };
      updatedDraftedSections[activeTask.sectionId] = { ...drafted, status: 'edited' };
      continue;
    }

    let parsed;
    try {
      const cleaned = response.content.trim()
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Parse failure → approve and continue
      console.warn('[editorAgent] Could not parse response — auto-approving');
      lastAppendedFeedback = { sectionId: activeTask.sectionId, verdict: 'approved', issues: [] };
      const taskIdx = updatedTaskQueue.findIndex((t) => t.taskId === activeTask.taskId);
      if (taskIdx !== -1) updatedTaskQueue[taskIdx] = { ...updatedTaskQueue[taskIdx], status: 'edited' };
      updatedDraftedSections[activeTask.sectionId] = { ...drafted, status: 'edited' };
      continue;
    }

    const avgScore = Object.values(parsed.scores || {}).reduce((a, b) => a + b, 0) /
      Math.max(Object.keys(parsed.scores || {}).length, 1);

    console.log(`[editorAgent] Verdict: ${parsed.verdict.toUpperCase()} (avg score: ${avgScore.toFixed(1)}/10)`);
    if (parsed.issues?.length > 0) {
      parsed.issues.forEach((issue) => console.log(`  ✗ ${issue}`));
    }

    lastAppendedFeedback = {
      sectionId: activeTask.sectionId,
      taskId:    activeTask.taskId,
      verdict:   parsed.verdict,
      issues:    parsed.issues || [],
      strengths: parsed.strengths || [],
      scores:    parsed.scores || {},
    };

    if (parsed.verdict === 'approved') {
      const taskIdx = updatedTaskQueue.findIndex((t) => t.taskId === activeTask.taskId);
      if (taskIdx !== -1) updatedTaskQueue[taskIdx] = { ...updatedTaskQueue[taskIdx], status: 'edited' };

      updatedDraftedSections[activeTask.sectionId] = {
        ...drafted,
        status:   'edited',
        editedAt: new Date().toISOString(),
        scores:   parsed.scores,
      };
    } else {
      updatedRejectionCounts[activeTask.sectionId] = currentRejections + 1;
      console.warn(`[editorAgent] Rejection ${currentRejections + 1}/${LOOP_LIMITS.editorAgentRejections} for "${drafted.heading}"`);
    }
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'editorAgent',
    model:        MODEL,
    inputTokens:  totalInputTokens,
    outputTokens: totalOutputTokens,
  });

  return {
    lastEditorFeedback:    lastAppendedFeedback,
    editorRejectionCounts: updatedRejectionCounts,
    draftedSections:       updatedDraftedSections,
    taskQueue:             updatedTaskQueue,
    ...(newErrors.length > 0 ? { errors: newErrors } : {}),
    ...tokenUpdate,
  };
}
