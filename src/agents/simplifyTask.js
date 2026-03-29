// src/agents/simplifyTask.js
// ============================================================
// Node 21: Simplify Task
//
// Responsibilities:
//  - Triggered when editorAgent rejects a section 3 times
//  - Splits the problematic section into 2-3 smaller sub-sections
//  - Inserts the new sub-tasks into the taskQueue
//  - Marks the original task as 'split' so it's skipped
//
// State reads:  lastEditorFeedback, taskQueue, outline
// State writes: taskQueue (inserts new tasks), outline
//
// Design doc: "Breaks the section into smaller sub-sections
//              to reduce LLM cognitive load."
// Loophole fix #7: "Escalate to rewrite instead of endless tweaks"
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';
import { v4 as uuidv4 } from 'uuid';

const MODEL = AGENT_MODEL_MAP.plannerAgent;  // Fast model for splitting

const SPLIT_SYSTEM_PROMPT = `You are a content architect. 
A section of an article has been repeatedly rejected by the editor.
Split it into 2-3 smaller, more focused sub-sections that are easier to write well.

Each sub-section should:
- Cover ONE clear idea or point
- Be achievable in 150-250 words
- Together cover everything the original section intended

RESPOND WITH VALID JSON ONLY:
{
  "subsections": [
    {
      "heading": "Sub-section heading",
      "purpose": "What this covers",
      "targetWordCount": 200,
      "keywords": ["kw1"]
    }
  ]
}`;

export async function simplifyTaskNode(state) {
  const { lastEditorFeedback, taskQueue, outline } = state;

  if (!lastEditorFeedback?.sectionId) {
    console.warn('[simplifyTask] No feedback to act on');
    return {};
  }

  const originalTask = taskQueue?.find(
    (t) => t.sectionId === lastEditorFeedback.sectionId
  );

  if (!originalTask) {
    console.warn('[simplifyTask] Original task not found');
    return {};
  }

  console.log(`[simplifyTask] Splitting section: "${originalTask.heading}"`);

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.3,
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.default,
  });

  let response;
  try {
    response = await llm.invoke([
      new SystemMessage(SPLIT_SYSTEM_PROMPT),
      new HumanMessage(
        `Original section: "${originalTask.heading}"\n` +
        `Original purpose: ${originalTask.purpose || 'not specified'}\n` +
        `Original word count target: ${originalTask.targetWordCount}\n` +
        `Editor rejection reasons:\n${lastEditorFeedback.issues?.map((i) => `- ${i}`).join('\n') || 'General quality issues'}\n\n` +
        `Split this into 2-3 smaller, more focused sub-sections.`
      ),
    ]);
  } catch (err) {
    console.error('[simplifyTask] LLM call failed:', err.message);
    // On failure, just reset the rejection counter and let it retry as-is
    return {
      editorRejectionCounts: {
        ...(state.editorRejectionCounts || {}),
        [lastEditorFeedback.sectionId]: 0,
      },
    };
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'simplifyTask',
    model:        MODEL,
    inputTokens:  response.usage_metadata?.input_tokens  || 0,
    outputTokens: response.usage_metadata?.output_tokens || 0,
  });

  let parsed;
  try {
    const cleaned = response.content.trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: just reset counter
    return {
      editorRejectionCounts: {
        ...(state.editorRejectionCounts || {}),
        [lastEditorFeedback.sectionId]: 0,
      },
      ...tokenUpdate,
    };
  }

  // ── Build replacement tasks ────────────────────────────
  const newTasks = parsed.subsections.map((sub, idx) => ({
    taskId:          uuidv4(),
    sectionId:       `${originalTask.sectionId}_split_${idx + 1}`,
    heading:         sub.heading,
    level:           3,   // Demote to H3 since it's a sub-section now
    phase:           originalTask.phase,
    canParallelize:  false,
    dependsOn:       originalTask.dependsOn,
    status:          'pending',
    targetWordCount: sub.targetWordCount || 200,
    requiresMedia:   false,   // Simplified tasks don't get media
    keywords:        sub.keywords || originalTask.keywords,
    purpose:         sub.purpose,
    splitFrom:       originalTask.sectionId,
  }));

  // Mark original task as split (skip it in future selection)
  const updatedQueue = taskQueue.map((t) =>
    t.taskId === originalTask.taskId
      ? { ...t, status: 'split' }
      : t
  );

  // Insert new tasks after the original task position
  const originalIdx = updatedQueue.findIndex((t) => t.taskId === originalTask.taskId);
  updatedQueue.splice(originalIdx + 1, 0, ...newTasks);

  // Update dependencies of any downstream tasks that depended on the old split task
  const lastNewTaskId = newTasks[newTasks.length - 1].taskId;
  updatedQueue.forEach((t) => {
    if (t.dependsOn?.includes(originalTask.taskId)) {
      t.dependsOn = t.dependsOn.map((id) =>
        id === originalTask.taskId ? lastNewTaskId : id
      );
    }
  });

  // Add the split sections to the outline for completeness
  const updatedOutlineSections = [...(outline.sections || [])];
  newTasks.forEach((task) => {
    updatedOutlineSections.push({
      id:             task.sectionId,
      heading:        task.heading,
      level:          task.level,
      targetWordCount:task.targetWordCount,
      requiresMedia:  false,
      keywords:       task.keywords,
      purpose:        task.purpose,
      parentId:       originalTask.sectionId,
    });
  });

  console.log(`[simplifyTask] Split "${originalTask.heading}" into ${newTasks.length} sub-sections:`);
  newTasks.forEach((t, i) => console.log(`  ${i + 1}. "${t.heading}" (~${t.targetWordCount}w)`));

  return {
    taskQueue: updatedQueue,
    outline: { ...outline, sections: updatedOutlineSections },
    editorRejectionCounts: {
      ...(state.editorRejectionCounts || {}),
      [lastEditorFeedback.sectionId]: 0,  // Reset counter
    },
    lastEditorFeedback: null,
    ...tokenUpdate,
  };
}
