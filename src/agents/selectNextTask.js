// src/agents/selectNextTask.js
// ============================================================
// Node 10: Select Next Task
//
// Responsibilities:
//  - Scan the task queue for the next pending task(s)
//  - If canParallelize: true, select ALL pending tasks in the
//    current phase that are ready (dependencies met)
//  - Mark selected tasks as 'in_progress'
//  - Update currentPhase if advancing to a new phase
//
// State reads:  taskQueue, currentPhase, totalTokensUsed
// State writes: taskQueue (status updates), activeTaskIds, currentPhase
//
// Design doc: "Selects multiple if canParallelize: true"
// ============================================================

import { checkBudget } from '../utils/tokenTracker.js';

// Check if all dependencies of a task are complete
function dependenciesMet(task, taskQueue) {
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  return task.dependsOn.every((depId) => {
    const dep = taskQueue.find((t) => t.taskId === depId);
    return dep && dep.status === 'complete';
  });
}

export async function selectNextTaskNode(state) {
  const { taskQueue, currentPhase, totalTokensUsed } = state;

  // ── Budget guard ───────────────────────────────────────
  const budgetCheck = checkBudget(totalTokensUsed || 0);
  if (!budgetCheck.allowed) {
    console.error('[selectNextTask] Token budget exhausted:', budgetCheck.reason);
    return {
      graphStatus:      'paused_budget',
      escalationReason: budgetCheck.reason,
    };
  }

  if (budgetCheck.budgetStatus?.warning) {
    console.warn('[selectNextTask]', budgetCheck.reason);
  }

  // ── Find candidate tasks ───────────────────────────────
  const pendingTasksPreCheck = taskQueue.filter((t) => t.status === 'pending');
  const pendingTasks = pendingTasksPreCheck.filter((t) => dependenciesMet(t, taskQueue));

  if (pendingTasks.length === 0) {
    // Check if there are still in_progress tasks (parallel execution)
    const inProgress = taskQueue.filter((t) => t.status === 'in_progress');
    if (inProgress.length > 0) {
      console.log(`[selectNextTask] ${inProgress.length} task(s) in progress — waiting`);
      return { activeTaskIds: inProgress.map((t) => t.taskId) };
    }

    const stuckTasks = pendingTasksPreCheck.filter((t) => t.status === 'pending');
    if (stuckTasks.length > 0) {
      // ── Auto-heal broken dependencies (Self-Correction for old threads) ──
      let healed = false;
      const healedQueue = taskQueue.map(t => {
        if (t.status !== 'pending' || !t.dependsOn?.length) return t;
        const freshDeps = t.dependsOn.filter(depId => {
          const depTask = taskQueue.find(dt => dt.taskId === depId);
          // Strip dead dependencies (e.g. split or missing tasks)
          if (!depTask || depTask.status === 'split') {
            healed = true;
            return false;
          }
          return true;
        });
        return freshDeps.length !== t.dependsOn.length ? { ...t, dependsOn: freshDeps } : t;
      });

      if (healed) {
        console.log('[selectNextTask] 🩹 Auto-healed broken dependencies from previous session lockup');
        // Let the graph loop once more, next time dependenciesMet will pass!
        return { taskQueue: healedQueue, activeTaskIds: [] };
      }

      console.error('[selectNextTask] ❌ STILL DEADLOCKED. Empty activeTaskIds.');
      return {
        graphStatus: 'error',
        errors: [{ node: 'selectNextTask', error: 'Dependency Deadlock Unresolvable.' }],
        activeTaskIds: []
      };
    }

    console.log('[selectNextTask] All tasks complete — proceeding to assembly');
    return { activeTaskIds: [] };
  }

  // ── Determine which phase we're in ────────────────────
  const nextPhase = pendingTasks[0].phase;
  const phaseTasks = pendingTasks.filter((t) => t.phase === nextPhase);

  // ── Select tasks for this run ─────────────────────────
  // If canParallelize, grab all tasks in this phase simultaneously
  // If not, grab only the first one
  const firstTask = phaseTasks[0];
  const selectedTasks = firstTask.canParallelize
    ? phaseTasks  // Select ALL parallelizable tasks in the phase
    : [firstTask]; // Select only one sequential task

  const selectedIds = selectedTasks.map((t) => t.taskId);

  // ── Update task statuses to in_progress ───────────────
  const updatedQueue = taskQueue.map((t) => {
    if (selectedIds.includes(t.taskId)) {
      return { ...t, status: 'in_progress' };
    }
    return t;
  });

  console.log(`[selectNextTask] Selected ${selectedTasks.length} task(s) for Phase ${nextPhase}:`);
  selectedTasks.forEach((t) => {
    console.log(`  ${t.canParallelize ? '∥' : '→'} [${t.sectionId}] "${t.heading}" (~${t.targetWordCount}w)`);
  });

  return {
    taskQueue:    updatedQueue,
    activeTaskIds: selectedIds,
    currentPhase: nextPhase,
  };
}
