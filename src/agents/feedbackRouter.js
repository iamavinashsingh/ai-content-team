// src/agents/feedbackRouter.js
// ============================================================
// Node 25: Feedback Router
//
// Responsibilities:
//  - Analyze user feedback and determine the correct agent to fix it
//  - Typos / tone issues → editorAgent (light touch)
//  - Factual changes / new sections → plannerAgent (structural)
//  - Prepare the task queue and context for the chosen route
//
// State reads:  userFeedback, taskQueue, outline, draftedSections
// State writes: taskQueue (adds new tasks), outline (adds sections),
//               lastEditorFeedback (for targeted edits)
// Model:        GPT-4o-mini
//
// Design doc: "Typos/Tone → editorAgent, Factual/New → plannerAgent"
// ============================================================

import { v4 as uuidv4 } from 'uuid';

export async function feedbackRouterNode(state) {
  const { userFeedback, taskQueue, outline } = state;

  if (!userFeedback) {
    console.warn('[feedbackRouter] No feedback to route');
    return {};
  }

  console.log('[feedbackRouter] Routing feedback...');

  const { typos, rewrites, newSections, comments } = userFeedback;
  const hasNewSections = newSections?.length > 0;
  const hasRewrites    = rewrites?.length > 0;
  const hasTypos       = typos?.length > 0;

  // ── Route: New sections (structural change) ────────────
  // If user wants new content added, inject tasks into plannerAgent flow
  if (hasNewSections) {
    console.log(`[feedbackRouter] ${newSections.length} new section(s) requested — routing to planner`);

    const newTasks = newSections.map((sectionRequest, idx) => ({
      taskId:          uuidv4(),
      sectionId:       `feedback_section_${Date.now()}_${idx}`,
      heading:         sectionRequest,
      level:           2,
      phase:           2,         // Insert as body sections
      canParallelize:  false,     // Sequential — we're in edit mode
      dependsOn:       [],
      status:          'pending',
      targetWordCount: 300,        // Default for user-requested sections
      requiresMedia:   false,
      keywords:        state.structuredBrief?.seoKeywords?.slice(0, 2) || [],
      purpose:         `User requested: ${sectionRequest}`,
      isUserRequested: true,
    }));

    // Add to outline
    const updatedSections = [
      ...(outline.sections || []),
      ...newTasks.map((t) => ({
        id:             t.sectionId,
        heading:        t.heading,
        level:          t.level,
        targetWordCount:t.targetWordCount,
        requiresMedia:  false,
        keywords:       t.keywords,
        purpose:        t.purpose,
      })),
    ];

    const updatedQueue = [...(taskQueue || []), ...newTasks];

    return {
      taskQueue: updatedQueue,
      outline:   { ...outline, sections: updatedSections },
      userFeedback: { ...userFeedback, newSections: [] },  // Clear handled items
    };
  }

  // ── Route: Section rewrites (moderate change) ──────────
  // Reset specific sections back to 'pending' for re-drafting
  if (hasRewrites) {
    console.log(`[feedbackRouter] ${rewrites.length} section rewrite(s) requested — routing to writer`);

    const updatedQueue = [...(taskQueue || [])];
    const rewriteInstructions = [];

    for (const rewriteRequest of rewrites) {
      // Format: "section_id: rewrite instructions"
      // Or just freeform which we apply to the most recent section
      const colonIdx = rewriteRequest.indexOf(':');
      const sectionId    = colonIdx > -1 ? rewriteRequest.slice(0, colonIdx).trim() : null;
      const instructions = colonIdx > -1 ? rewriteRequest.slice(colonIdx + 1).trim() : rewriteRequest;

      if (sectionId) {
        // Find and reset the specific section
        const taskIdx = updatedQueue.findIndex((t) => t.sectionId === sectionId);
        if (taskIdx !== -1) {
          updatedQueue[taskIdx] = { ...updatedQueue[taskIdx], status: 'pending' };
          rewriteInstructions.push({ sectionId, instructions });
          console.log(`[feedbackRouter]   Reset section ${sectionId} to pending`);
        }
      }
    }

    return {
      taskQueue:          updatedQueue,
      lastEditorFeedback: {
        sectionId: rewriteInstructions[0]?.sectionId,
        verdict:   'rejected',
        issues:    rewriteInstructions.map((r) => r.instructions),
        fromUser:  true,
      },
      activeTaskIds: rewriteInstructions.map((r) => {
        const task = updatedQueue.find((t) => t.sectionId === r.sectionId);
        return task?.taskId;
      }).filter(Boolean),
    };
  }

  // ── Route: Typos / tone only (light touch) ────────────
  // Pass feedback as editor instructions without full rewrite
  if (hasTypos || comments) {
    console.log('[feedbackRouter] Minor edits requested — routing to editor');
    const allFeedback = [...(typos || []), comments].filter(Boolean);

    return {
      lastEditorFeedback: {
        sectionId: null,    // Editor will apply globally
        verdict:   'rejected',
        issues:    allFeedback,
        fromUser:  true,
        lightEdit: true,    // Signal to editorAgent: minor fixes only
      },
    };
  }

  console.log('[feedbackRouter] No actionable feedback found — proceeding to publisher');
  return { userFeedback: { ...userFeedback, satisfied: true } };
}
