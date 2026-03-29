// src/agents/stateCompactor.js
// ============================================================
// Node 20: State Compactor ⭐ NEW (V2 Loophole Fix #5)
//
// Responsibilities:
//  - Compress completed section full text out of active context
//  - Keep only the 2-sentence registry summaries for done sections
//  - Prevents OpenAI context window overflow on long articles
//  - Runs before every new section selection loop
//
// State reads:  draftedSections, taskQueue
// State writes: draftedSections (compresses completed sections)
//
// Design doc: "Compresses old context to save tokens. Keeps only
//              summaries of completed sections rather than full
//              raw text in the system prompt."
//
// Note: We don't delete the full text from state entirely —
// it's needed for documentAssembler. We flag it as "compacted"
// so contextBuilder knows not to include it in future prompts.
// ============================================================

export async function stateCompactorNode(state) {
  const { draftedSections, taskQueue } = state;

  if (!draftedSections || Object.keys(draftedSections).length === 0) {
    return {};
  }

  // Find sections that are complete AND have their full text still in state
  const completedSectionIds = (taskQueue || [])
    .filter((t) => t.status === 'complete')
    .map((t) => t.sectionId);

  const compactedSections = {};
  let compactedCount = 0;
  let tokensSaved = 0;

  for (const sectionId of completedSectionIds) {
    const section = draftedSections[sectionId];

    // Skip if already compacted or not yet complete
    if (!section || section.compacted || section.status !== 'complete') continue;

    // Estimate tokens saved (rough: 4 chars = 1 token)
    const rawLength = section.rawText?.length || 0;
    const savings = Math.floor(rawLength / 4);

    // Mark as compacted — preserve rawText for assembler but flag it
    // contextBuilder checks for section.compacted and skips full text
    compactedSections[sectionId] = {
      ...section,
      compacted:     true,
      compactedAt:   new Date().toISOString(),
      // Keep rawText intact for documentAssembler
      // contextBuilder will use sectionRegistry instead of this text
    };

    tokensSaved   += savings;
    compactedCount++;
  }

  if (compactedCount > 0) {
    console.log(`[stateCompactor] Compacted ${compactedCount} section(s) — ~${tokensSaved.toLocaleString()} tokens freed from active context`);
  } else {
    console.log('[stateCompactor] Nothing to compact yet');
  }

  return compactedCount > 0 ? { draftedSections: compactedSections } : {};
}
