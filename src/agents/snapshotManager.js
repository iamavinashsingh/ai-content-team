// src/agents/snapshotManager.js
// ============================================================
// Node 17: Snapshot Manager ⭐ NEW (V2 Loophole Fix #3)
//
// Responsibilities:
//  - After each section completes media, save a full version
//    snapshot to PostgreSQL
//  - Version label: "v{N}_section_{id}_complete"
//  - Enables rollback if user requests a previous version
//  - Tracks cumulative token spend per snapshot
//
// State reads:  draftedSections, activeTaskIds, taskQueue,
//               projectId, totalTokensUsed, snapshots
// State writes: snapshots, taskQueue (marks as complete)
//
// Design doc: "Saves version history to PostgreSQL (e.g.
//              v1.2_section_3_complete). Allows rollback."
// ============================================================

import { saveSnapshot } from '../database/index.js';

export async function snapshotManagerNode(state) {
  const { draftedSections, activeTaskIds, taskQueue, projectId, totalTokensUsed } = state;

  if (!activeTaskIds?.length) return {};

  // Find the section(s) that just completed media generation
  const completedTasks = taskQueue?.filter(
    (t) => activeTaskIds.includes(t.taskId) && t.status === 'media_done'
  ) || [];

  if (completedTasks.length === 0) {
    console.warn('[snapshotManager] No media_done tasks found — skipping snapshot');
    return {};
  }

  const newSnapshots = [];
  const updatedTaskQueue = [...taskQueue];

  for (const task of completedTasks) {
    console.log(`[snapshotManager] Saving snapshot for section: ${task.sectionId}`);

    try {
      // Save versioned snapshot to PostgreSQL
      const snapshot = await saveSnapshot({
        projectId,
        sectionId:      task.sectionId,
        graphState:     {
          // Save key state fields for rollback — not the full graph (too large)
          taskQueue:       updatedTaskQueue,
          sectionRegistry: state.sectionRegistry,
          brandVoicePatterns: state.brandVoicePatterns,
          outline:         state.outline,
        },
        draftedSections,
        tokenCount: totalTokensUsed || 0,
      });

      newSnapshots.push({
        version:   snapshot.version_number,
        label:     snapshot.version_label,
        sectionId: task.sectionId,
        savedAt:   snapshot.created_at,
      });

      console.log(`[snapshotManager] ✅ Snapshot saved: ${snapshot.version_label}`);
    } catch (err) {
      console.error(`[snapshotManager] Snapshot failed for ${task.sectionId}: ${err.message}`);
      // Non-fatal — continue without snapshot
    }

    // Mark task as fully complete
    const taskIdx = updatedTaskQueue.findIndex((t) => t.taskId === task.taskId);
    if (taskIdx !== -1) {
      updatedTaskQueue[taskIdx] = { ...updatedTaskQueue[taskIdx], status: 'complete' };
    }

    // Mark section as complete in draftedSections
    if (draftedSections?.[task.sectionId]) {
      draftedSections[task.sectionId] = {
        ...draftedSections[task.sectionId],
        status:      'complete',
        completedAt: new Date().toISOString(),
      };
    }
  }

  const completedCount = updatedTaskQueue.filter((t) => t.status === 'complete').length;
  const totalCount = updatedTaskQueue.length;
  console.log(`[snapshotManager] Progress: ${completedCount}/${totalCount} sections complete`);

  return {
    snapshots:  newSnapshots,
    taskQueue:  updatedTaskQueue,
    draftedSections: Object.fromEntries(
      completedTasks.map((t) => [
        t.sectionId,
        { ...draftedSections[t.sectionId], status: 'complete', completedAt: new Date().toISOString() },
      ])
    ),
  };
}
