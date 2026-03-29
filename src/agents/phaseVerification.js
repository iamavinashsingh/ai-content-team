// src/agents/phaseVerification.js
// ============================================================
// Node 18: Phase Verification
//
// Responsibilities:
//  - Check if all tasks across ALL phases are complete
//  - If yes → route to documentAssembler
//  - If pending tasks remain → route to brandVoiceExtractor
//    (which then loops back through stateCompactor → selectNextTask)
//
// State reads:  taskQueue
// State writes: (routing only — no state mutations)
//
// Design doc: "Checks if all sections in the current phase
//              are done."
// ============================================================

export async function phaseVerificationNode(state) {
  const { taskQueue } = state;

  if (!taskQueue?.length) {
    console.warn('[phaseVerification] Empty task queue — proceeding to assembly');
    return {};
  }

  const total    = taskQueue.length;
  const complete = taskQueue.filter((t) => t.status === 'complete').length;
  const pending  = taskQueue.filter((t) => t.status === 'pending').length;
  const inProgress = taskQueue.filter((t) => ['in_progress', 'drafted', 'edited', 'verified', 'media_done'].includes(t.status)).length;

  console.log(`[phaseVerification] Status: ${complete}/${total} complete | ${pending} pending | ${inProgress} in-progress`);

  // Log per-phase breakdown
  const phases = [...new Set(taskQueue.map((t) => t.phase))].sort();
  for (const phase of phases) {
    const phaseTasks = taskQueue.filter((t) => t.phase === phase);
    const phaseComplete = phaseTasks.filter((t) => t.status === 'complete').length;
    console.log(`  Phase ${phase}: ${phaseComplete}/${phaseTasks.length} complete`);
  }

  // The conditional routing in graphBuilder.js reads taskQueue directly
  // This node just logs — the routing function does the decision
  return {};
}
