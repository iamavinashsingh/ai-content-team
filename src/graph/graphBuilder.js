// src/graph/graphBuilder.js
// ============================================================
// LangGraph Graph Builder — The Complete 28-Node Architecture
//
// This file:
//  1. Imports all 28 node functions
//  2. Registers them in the StateGraph
//  3. Defines ALL edges (normal + conditional)
//  4. Compiles and exports the graph
//
// Node logic is NOT here — each node lives in src/agents/.
// This file is purely structural: "what connects to what."
// ============================================================

import { StateGraph, END, START, interrupt } from '@langchain/langgraph';
import { GraphState, NodeNames } from '../state/graphState.js';

// ── Node imports ─────────────────────────────────────────
// Phase 1-2: Strategy & Research
import { pmStrategistNode }       from '../agents/pmStrategist.js';
import { humanInputNode }         from '../agents/humanInput.js';
import { researchStep1Node }      from '../agents/researchStep1.js';
import { researchStep2Node }      from '../agents/researchStep2.js';

// Phase 3: Architecture
import { architectOutlineNode }   from '../agents/architectOutline.js';
import { blueprintValidatorNode } from '../agents/blueprintValidator.js';

// Phase 4: Planning & Setup
import { plannerAgentNode }       from '../agents/plannerAgent.js';
import { setupWorkspaceNode }     from '../agents/setupWorkspace.js';
import { workspaceHealthNode }    from '../agents/workspaceHealthCheck.js';

// Phase 5: Writing Engine
import { selectNextTaskNode }     from '../agents/selectNextTask.js';
import { contextBuilderNode }     from '../agents/contextBuilder.js';
import { writerAgentNode }        from '../agents/writerAgent.js';
import { updateRegistryNode }     from '../agents/updateRegistry.js';
import { editorAgentNode }        from '../agents/editorAgent.js';
import { factCheckValidatorNode } from '../agents/factCheckValidator.js';
import { mediaAgentNode }         from '../agents/mediaAgent.js';
import { snapshotManagerNode }    from '../agents/snapshotManager.js';
import { phaseVerificationNode }  from '../agents/phaseVerification.js';
import { brandVoiceExtractorNode }from '../agents/brandVoiceExtractor.js';
import { stateCompactorNode }     from '../agents/stateCompactor.js';
import { simplifyTaskNode }       from '../agents/simplifyTask.js';

// Phase 6: Assembly & Publishing
import { documentAssemblerNode }  from '../agents/documentAssembler.js';
import { presentToUserNode }      from '../agents/presentToUser.js';
import { feedbackCollectorNode }  from '../agents/feedbackCollector.js';
import { feedbackRouterNode }     from '../agents/feedbackRouter.js';
import { humanEscalationNode }    from '../agents/humanEscalation.js';
import { publisherAgentNode }     from '../agents/publisherAgent.js';

const N = NodeNames;

// ── Conditional Routing Functions ─────────────────────────
// These are pure functions that read state and return a node name.
// LangGraph uses these to decide which edge to follow.

function routeAfterPmStrategist(state) {
  if (state.graphStatus === 'error') return END;
  if (state.briefStatus === 'needs_clarification') {
    return N.HUMAN_INPUT;
  }
  return N.RESEARCH_STEP_1;
}

function routeAfterBlueprintValidator(state) {
  const { valid } = state.outlineValidation || {};
  const retries = state.outlineRetryCount || 0;

  if (valid) {
    return N.PLANNER_AGENT;
  }

  // Max retries exceeded — escalate
  if (retries >= 2) {
    console.warn('[Graph] Blueprint validation failed after max retries — escalating');
    return N.HUMAN_ESCALATION;
  }

  // Retry outline generation
  return N.ARCHITECT_OUTLINE;
}

function routeAfterWorkspaceHealth(state) {
  const health = state.workspaceHealth;
  if (health?.allHealthy) {
    return N.SELECT_NEXT_TASK;
  }
  return N.HUMAN_ESCALATION;
}

function routeAfterEditorAgent(state) {
  const feedback = state.lastEditorFeedback;
  if (!feedback) return N.FACT_CHECK_VALIDATOR;

  if (feedback.verdict === 'approved') {
    return N.FACT_CHECK_VALIDATOR;
  }

  // Check rejection count for the current section
  const sectionId = feedback.sectionId;
  const rejections = state.editorRejectionCounts?.[sectionId] || 0;

  if (rejections >= 2) {
    // Design doc: "Max 2 rejections → simplifyTask"
    return N.SIMPLIFY_TASK;
  }

  return N.WRITER_AGENT;
}

function routeAfterFactCheckValidator(state) {
  const hallucinations = state.detectedHallucinations || [];

  // Only look at hallucinations for the current active tasks
  const currentSectionIds = state.activeTaskIds || [];
  const currentHallucinations = hallucinations.filter(
    (h) => currentSectionIds.includes(h.sectionId)
  );

  if (currentHallucinations.length > 0) {
    console.warn(`[Graph] ${currentHallucinations.length} hallucination(s) detected — rewriting`);
    return N.WRITER_AGENT;
  }

  return N.MEDIA_AGENT;
}

function routeAfterPhaseVerification(state) {
  const tasks = state.taskQueue || [];
  const pendingTasks = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  );

  if (pendingTasks.length === 0) {
    // All sections done — proceed to assembly
    return N.DOCUMENT_ASSEMBLER;
  }

  // More sections to write
  return N.BRAND_VOICE_EXTRACTOR;
}

function routeAfterBrandVoiceExtractor(state) {
  // Always compact then select next task
  return N.STATE_COMPACTOR;
}

function routeAfterFeedbackCollector(state) {
  const feedback = state.userFeedback;

  if (!feedback || feedback.satisfied) {
    return N.PUBLISHER_AGENT;
  }

  return N.FEEDBACK_ROUTER;
}

function routeAfterFeedbackRouter(state) {
  const feedback = state.userFeedback;
  if (!feedback) return N.SELECT_NEXT_TASK;

  // Design doc: Typos/Tone → editorAgent, Factual/New sections → plannerAgent
  if (feedback.rewrites?.length > 0 || feedback.newSections?.length > 0) {
    return N.PLANNER_AGENT;
  }

  return N.EDITOR_AGENT;
}

// ── Graph Builder ──────────────────────────────────────────
export function buildGraph() {
  const graph = new StateGraph(GraphState);

  // ── Register all 28 nodes ─────────────────────────────
  graph
    .addNode(N.PM_STRATEGIST,         pmStrategistNode)
    .addNode(N.HUMAN_INPUT,           humanInputNode)
    .addNode(N.RESEARCH_STEP_1,       researchStep1Node)
    .addNode(N.RESEARCH_STEP_2,       researchStep2Node)
    .addNode(N.ARCHITECT_OUTLINE,     architectOutlineNode)
    .addNode(N.BLUEPRINT_VALIDATOR,   blueprintValidatorNode)
    .addNode(N.PLANNER_AGENT,         plannerAgentNode)
    .addNode(N.SETUP_WORKSPACE,       setupWorkspaceNode)
    .addNode(N.WORKSPACE_HEALTH,      workspaceHealthNode)
    .addNode(N.SELECT_NEXT_TASK,      selectNextTaskNode)
    .addNode(N.CONTEXT_BUILDER,       contextBuilderNode)
    .addNode(N.WRITER_AGENT,          writerAgentNode)
    .addNode(N.UPDATE_REGISTRY,       updateRegistryNode)
    .addNode(N.EDITOR_AGENT,          editorAgentNode)
    .addNode(N.FACT_CHECK_VALIDATOR,  factCheckValidatorNode)
    .addNode(N.MEDIA_AGENT,           mediaAgentNode)
    .addNode(N.SNAPSHOT_MANAGER,      snapshotManagerNode)
    .addNode(N.PHASE_VERIFICATION,    phaseVerificationNode)
    .addNode(N.BRAND_VOICE_EXTRACTOR, brandVoiceExtractorNode)
    .addNode(N.STATE_COMPACTOR,       stateCompactorNode)
    .addNode(N.SIMPLIFY_TASK,         simplifyTaskNode)
    .addNode(N.DOCUMENT_ASSEMBLER,    documentAssemblerNode)
    .addNode(N.PRESENT_TO_USER,       presentToUserNode)
    .addNode(N.FEEDBACK_COLLECTOR,    feedbackCollectorNode)
    .addNode(N.FEEDBACK_ROUTER,       feedbackRouterNode)
    .addNode(N.HUMAN_ESCALATION,      humanEscalationNode)
    .addNode(N.PUBLISHER_AGENT,       publisherAgentNode);

  // ── Define Edges ──────────────────────────────────────
  // START → first node
  graph.addEdge(START, N.PM_STRATEGIST);

  // Node 1: pmStrategist — conditional on brief status
  graph.addConditionalEdges(N.PM_STRATEGIST, routeAfterPmStrategist, {
    [N.HUMAN_INPUT]:     N.HUMAN_INPUT,
    [N.RESEARCH_STEP_1]: N.RESEARCH_STEP_1,
    [END]:               END,
  });

  // Node 2: humanInput — always loops back to PM
  graph.addEdge(N.HUMAN_INPUT, N.PM_STRATEGIST);

  // Nodes 3-4: Research pipeline (sequential)
  graph.addEdge(N.RESEARCH_STEP_1, N.RESEARCH_STEP_2);
  graph.addEdge(N.RESEARCH_STEP_2, N.ARCHITECT_OUTLINE);

  // Node 5-6: Outline + validation
  graph.addEdge(N.ARCHITECT_OUTLINE, N.BLUEPRINT_VALIDATOR);
  graph.addConditionalEdges(N.BLUEPRINT_VALIDATOR, routeAfterBlueprintValidator, {
    [N.PLANNER_AGENT]:    N.PLANNER_AGENT,
    [N.ARCHITECT_OUTLINE]:N.ARCHITECT_OUTLINE,
    [N.HUMAN_ESCALATION]: N.HUMAN_ESCALATION,
  });

  // Nodes 7-9: Workspace setup pipeline
  graph.addEdge(N.PLANNER_AGENT,    N.SETUP_WORKSPACE);
  graph.addEdge(N.SETUP_WORKSPACE,  N.WORKSPACE_HEALTH);
  graph.addConditionalEdges(N.WORKSPACE_HEALTH, routeAfterWorkspaceHealth, {
    [N.SELECT_NEXT_TASK]: N.SELECT_NEXT_TASK,
    [N.HUMAN_ESCALATION]: N.HUMAN_ESCALATION,
  });

  // Nodes 10-12: Task selection → context building → writing
  graph.addEdge(N.SELECT_NEXT_TASK, N.CONTEXT_BUILDER);
  graph.addEdge(N.CONTEXT_BUILDER,  N.WRITER_AGENT);
  graph.addEdge(N.WRITER_AGENT,     N.UPDATE_REGISTRY);
  graph.addEdge(N.UPDATE_REGISTRY,  N.EDITOR_AGENT);

  // Node 14: Editor — conditional on verdict + rejection count
  graph.addConditionalEdges(N.EDITOR_AGENT, routeAfterEditorAgent, {
    [N.FACT_CHECK_VALIDATOR]: N.FACT_CHECK_VALIDATOR,
    [N.WRITER_AGENT]:         N.WRITER_AGENT,
    [N.SIMPLIFY_TASK]:        N.SIMPLIFY_TASK,
  });

  // Node 15: Fact checker — conditional on hallucinations
  graph.addConditionalEdges(N.FACT_CHECK_VALIDATOR, routeAfterFactCheckValidator, {
    [N.MEDIA_AGENT]:   N.MEDIA_AGENT,
    [N.WRITER_AGENT]:  N.WRITER_AGENT,
  });

  // Nodes 16-18: Media → Snapshot → Phase check
  graph.addEdge(N.MEDIA_AGENT,       N.SNAPSHOT_MANAGER);
  graph.addEdge(N.SNAPSHOT_MANAGER,  N.PHASE_VERIFICATION);

  // Node 18: Phase verification — done vs more sections
  graph.addConditionalEdges(N.PHASE_VERIFICATION, routeAfterPhaseVerification, {
    [N.DOCUMENT_ASSEMBLER]:   N.DOCUMENT_ASSEMBLER,
    [N.BRAND_VOICE_EXTRACTOR]:N.BRAND_VOICE_EXTRACTOR,
  });

  // Nodes 19-20: Brand voice → State compaction → loop back
  graph.addConditionalEdges(N.BRAND_VOICE_EXTRACTOR, routeAfterBrandVoiceExtractor, {
    [N.STATE_COMPACTOR]: N.STATE_COMPACTOR,
  });
  graph.addEdge(N.STATE_COMPACTOR, N.SELECT_NEXT_TASK);

  // Node 21: simplifyTask — feeds back to task selection
  graph.addEdge(N.SIMPLIFY_TASK, N.SELECT_NEXT_TASK);

  // Nodes 22-25: Assembly → Review → Feedback
  graph.addEdge(N.DOCUMENT_ASSEMBLER, N.PRESENT_TO_USER);
  graph.addEdge(N.PRESENT_TO_USER,    N.FEEDBACK_COLLECTOR);
  graph.addConditionalEdges(N.FEEDBACK_COLLECTOR, routeAfterFeedbackCollector, {
    [N.PUBLISHER_AGENT]: N.PUBLISHER_AGENT,
    [N.FEEDBACK_ROUTER]: N.FEEDBACK_ROUTER,
  });

  // Node 25: Feedback router — routes to editor or planner
  graph.addConditionalEdges(N.FEEDBACK_ROUTER, routeAfterFeedbackRouter, {
    [N.PLANNER_AGENT]: N.PLANNER_AGENT,
    [N.EDITOR_AGENT]:  N.EDITOR_AGENT,
    [N.SELECT_NEXT_TASK]: N.SELECT_NEXT_TASK,
  });

  // Node 26: Human escalation — terminal state (human must intervene)
  graph.addEdge(N.HUMAN_ESCALATION, END);

  // Node 27: Publisher — success terminal state
  graph.addEdge(N.PUBLISHER_AGENT, END);

  // ── Compile ───────────────────────────────────────────
  // The compiled graph is what gets .invoke()'d or .stream()'d
  const compiled = graph.compile({
    // Interrupt points: nodes where the graph pauses for human input
    interruptBefore: [N.HUMAN_INPUT, N.FEEDBACK_COLLECTOR],
  });

  console.log('[Graph] ✅ 28-node LangGraph compiled successfully.');
  return compiled;
}

// ── Singleton compiled graph ───────────────────────────────
let compiledGraph = null;

export function getGraph() {
  if (!compiledGraph) {
    compiledGraph = buildGraph();
  }
  return compiledGraph;
}
