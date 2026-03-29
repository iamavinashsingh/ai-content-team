// src/agents/plannerAgent.js
// ============================================================
// Node 7: Planner Agent
//
// Responsibilities:
//  - Break the validated outline into discrete drafting tasks
//  - Determine which sections can be written simultaneously
//  - Assign phases (phase 1 = intro, phase 2 = body sections
//    in parallel, phase 3 = conclusion)
//  - Mark dependencies (conclusion depends on all body sections)
//
// State reads:  outline, structuredBrief
// State writes: taskQueue, currentPhase
// Model:        GPT-4o-mini (dependency logic is rule-based)
//
// Design doc: "Marks which sections can be written simultaneously
//              (canParallelize: true — e.g. Body Para 1 and 2)"
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { updateProject } from '../database/index.js';

export async function plannerAgentNode(state) {
  const { outline, structuredBrief } = state;
  console.log(`[plannerAgent] Building task queue from ${outline.sections.length} sections...`);

  const tasks = [];

  // ── Phase assignment logic ─────────────────────────────
  // Phase 1: Introduction sections (level 2, first section)
  // Phase 2: All body sections (can parallelize within phase)
  // Phase 3: Conclusion / CTA sections (depends on phase 2)
  
  const h2Sections = outline.sections.filter((s) => s.level === 2);
  const h3Sections = outline.sections.filter((s) => s.level === 3);

  // Identify intro and conclusion sections by position and purpose keywords
  const introKeywords    = ['intro', 'introduction', 'overview', 'what is', 'background'];
  const conclusionKeywords = ['conclusion', 'summary', 'final', 'wrap', 'takeaway', 'next steps', 'cta'];

  const isIntro = (s) => introKeywords.some((kw) => s.heading.toLowerCase().includes(kw)) || s === h2Sections[0];
  const isConclusion = (s) => conclusionKeywords.some((kw) => s.heading.toLowerCase().includes(kw)) || s === h2Sections[h2Sections.length - 1];

  const introSections      = h2Sections.filter(isIntro);
  const conclusionSections = h2Sections.filter(isConclusion);
  const bodySections       = h2Sections.filter((s) => !isIntro(s) && !isConclusion(s));

  // ── Build phase 1: Intro ───────────────────────────────
  for (const section of introSections) {
    const taskId = uuidv4();
    tasks.push({
      taskId,
      sectionId:       section.id,
      heading:         section.heading,
      level:           section.level,
      phase:           1,
      canParallelize:  false,  // Intro must run alone — sets the voice
      dependsOn:       [],
      status:          'pending',
      targetWordCount: section.targetWordCount,
      requiresMedia:   section.requiresMedia,
      mediaHint:       section.mediaHint,
      keywords:        section.keywords,
      purpose:         section.purpose,
    });

    // Add any H3s under this intro
    const childH3s = h3Sections.filter((s) => s.parentId === section.id);
    for (const sub of childH3s) {
      tasks.push({
        taskId:          uuidv4(),
        sectionId:       sub.id,
        heading:         sub.heading,
        level:           sub.level,
        phase:           1,
        canParallelize:  false,
        dependsOn:       [taskId],
        status:          'pending',
        targetWordCount: sub.targetWordCount,
        requiresMedia:   sub.requiresMedia || false,
        mediaHint:       sub.mediaHint || null,
        keywords:        sub.keywords,
        purpose:         sub.purpose,
      });
    }
  }

  // ── Build phase 2: Body sections (parallelizable) ─────
  // Body sections can run in parallel since they don't depend on each other
  // EXCEPTION: If one body section explicitly references another, it must wait
  const introTaskIds = tasks.map((t) => t.taskId);

  for (const section of bodySections) {
    const taskId = uuidv4();
    tasks.push({
      taskId,
      sectionId:       section.id,
      heading:         section.heading,
      level:           section.level,
      phase:           2,
      canParallelize:  true,   // ← Design doc: body sections run in parallel
      dependsOn:       introTaskIds,
      status:          'pending',
      targetWordCount: section.targetWordCount,
      requiresMedia:   section.requiresMedia,
      mediaHint:       section.mediaHint,
      keywords:        section.keywords,
      purpose:         section.purpose,
    });

    // H3s under body sections run after their parent H2
    const childH3s = h3Sections.filter((s) => s.parentId === section.id);
    for (const sub of childH3s) {
      tasks.push({
        taskId:          uuidv4(),
        sectionId:       sub.id,
        heading:         sub.heading,
        level:           sub.level,
        phase:           2,
        canParallelize:  false,  // H3s sequential within their parent
        dependsOn:       [taskId],
        status:          'pending',
        targetWordCount: sub.targetWordCount,
        requiresMedia:   sub.requiresMedia || false,
        mediaHint:       sub.mediaHint || null,
        keywords:        sub.keywords,
        purpose:         sub.purpose,
      });
    }
  }

  // ── Build phase 3: Conclusion ──────────────────────────
  const bodyTaskIds = tasks.filter((t) => t.phase === 2).map((t) => t.taskId);

  for (const section of conclusionSections) {
    tasks.push({
      taskId:          uuidv4(),
      sectionId:       section.id,
      heading:         section.heading,
      level:           section.level,
      phase:           3,
      canParallelize:  false,  // Conclusion waits for all body sections
      dependsOn:       [...introTaskIds, ...bodyTaskIds],
      status:          'pending',
      targetWordCount: section.targetWordCount,
      requiresMedia:   section.requiresMedia,
      mediaHint:       section.mediaHint,
      keywords:        section.keywords,
      purpose:         section.purpose,
    });
  }

  // Log the plan
  console.log(`[plannerAgent] Task queue created:`);
  console.log(`  Phase 1 (Intro):       ${tasks.filter((t) => t.phase === 1).length} task(s)`);
  console.log(`  Phase 2 (Body, ∥):    ${tasks.filter((t) => t.phase === 2).length} task(s) — parallelizable`);
  console.log(`  Phase 3 (Conclusion):  ${tasks.filter((t) => t.phase === 3).length} task(s)`);
  console.log(`  Total:                 ${tasks.length} task(s)`);

  // Save the outline to DB for reference
  await updateProject(state.projectId, {
    outline:     outline,
    status:      'writing',
  });

  return {
    taskQueue:    tasks,
    currentPhase: 1,
  };
}
