// src/state/graphState.js
// ============================================================
// Master Graph State
// 
// This is the SINGLE source of truth passed between all 28 
// nodes. LangGraph passes this object through every node —
// each node reads what it needs and returns only the keys 
// it modifies (partial updates).
//
// Design principle: Every field is nullable/optional with a 
// default so the graph can be initialized cleanly at Node 1.
// ============================================================

import { Annotation, messagesStateReducer } from '@langchain/langgraph';

// ── Section Status Enum ────────────────────────────────────
export const SectionStatus = {
  PENDING:    'pending',
  IN_PROGRESS:'in_progress',
  DRAFTED:    'drafted',
  EDITED:     'edited',
  VERIFIED:   'verified',   // Passed factCheckValidator
  MEDIA_DONE: 'media_done',
  COMPLETE:   'complete',
};

// ── Node Names (used in edge routing) ─────────────────────
export const NodeNames = {
  PM_STRATEGIST:        'pmStrategist',
  HUMAN_INPUT:          'humanInput',
  RESEARCH_STEP_1:      'researchStep1',
  RESEARCH_STEP_2:      'researchStep2',
  ARCHITECT_OUTLINE:    'architectOutline',
  BLUEPRINT_VALIDATOR:  'blueprintValidator',
  PLANNER_AGENT:        'plannerAgent',
  SETUP_WORKSPACE:      'setupWorkspace',
  WORKSPACE_HEALTH:     'workspaceHealthCheck',
  SELECT_NEXT_TASK:     'selectNextTask',
  CONTEXT_BUILDER:      'contextBuilder',
  WRITER_AGENT:         'writerAgent',
  UPDATE_REGISTRY:      'updateRegistry',
  EDITOR_AGENT:         'editorAgent',
  FACT_CHECK_VALIDATOR: 'factCheckValidator',
  MEDIA_AGENT:          'mediaAgent',
  SNAPSHOT_MANAGER:     'snapshotManager',
  PHASE_VERIFICATION:   'phaseVerification',
  BRAND_VOICE_EXTRACTOR:'brandVoiceExtractor',
  STATE_COMPACTOR:      'stateCompactor',
  SIMPLIFY_TASK:        'simplifyTask',
  DOCUMENT_ASSEMBLER:   'documentAssembler',
  PRESENT_TO_USER:      'presentToUser',
  FEEDBACK_COLLECTOR:   'feedbackCollector',
  FEEDBACK_ROUTER:      'feedbackRouter',
  HUMAN_ESCALATION:     'humanEscalation',
  PUBLISHER_AGENT:      'publisherAgent',
};

// ── Master State Annotation ────────────────────────────────
// LangGraph uses Annotation to define state shape + reducers.
// Default reducer = last-write-wins (fine for most fields).
// messagesStateReducer = append-only (for conversation history).
export const GraphState = Annotation.Root({

  // ── Project Identity ─────────────────────────────────────
  projectId: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  workspaceId: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // ── Phase 1: Brief & Strategy ─────────────────────────────
  // Raw input from the user
  rawBrief: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Structured brief after PM analysis
  // Shape: { topic, targetAudience, tone, desiredLength, seoKeywords[], angle, cmsTarget }
  structuredBrief: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Questions PM needs answered before proceeding
  clarifyingQuestions: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),

  // User's answers to clarifying questions
  clarifyingAnswers: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // 'needs_clarification' | 'brief_ready'
  briefStatus: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // ── Phase 2: Research ─────────────────────────────────────
  // Generated search queries (5-10 strings)
  searchQueries: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),

  // List of scraped sources: [{ url, title, summary, scrapedAt }]
  scrapedSources: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),

  // Flag: research has been embedded into Pinecone
  researchComplete: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => false,
  }),

  // ── Phase 3: Architecture ─────────────────────────────────
  // Full outline structure
  // Shape: { h1, sections: [{ id, heading, level, targetWordCount, requiresMedia, keywords[] }] }
  outline: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Validation result from blueprintValidator
  // Shape: { valid: bool, issues: string[] }
  outlineValidation: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Retry count for outline regeneration (max = LOOP_LIMITS.blueprintValidatorRetries)
  outlineRetryCount: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => 0,
  }),

  // ── Phase 4: Planning ─────────────────────────────────────
  // Ordered task queue produced by plannerAgent
  // Shape: [{ taskId, sectionId, phase, canParallelize, dependsOn[], status }]
  taskQueue: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),

  // Currently active task IDs (may be multiple if parallelizing)
  activeTaskIds: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),

  // Current drafting phase number (phases group parallelizable tasks)
  currentPhase: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => 1,
  }),

  // ── Phase 5: Writing Engine ───────────────────────────────
  // The document section registry — what's been written so far
  // Shape: { [sectionId]: { summary, keywordsUsed[], completedAt } }
  sectionRegistry: Annotation({
    reducer: (existing, update) => ({ ...existing, ...update }),  // Deep merge
    default: () => ({}),
  }),

  // Extracted brand voice patterns (populated after first major section)
  // Shape: { tone, pacing, formattingStyle, vocabularyPatterns[], avoidWords[] }
  brandVoicePatterns: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Context package built for current section
  // Shape: { researchChunks[], sectionOutline, registrySummary, brandVoice }
  currentContext: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // All drafted sections: { [sectionId]: { rawText, status, version, mediaUrl } }
  draftedSections: Annotation({
    reducer: (existing, update) => ({ ...existing, ...update }),  // Deep merge
    default: () => ({}),
  }),

  // Editor rejection counter per section: { [sectionId]: count }
  editorRejectionCounts: Annotation({
    reducer: (existing, update) => ({ ...existing, ...update }),
    default: () => ({}),
  }),

  // Last editor feedback: { sectionId, issues[], verdict }
  lastEditorFeedback: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Hallucinations flagged by factCheckValidator
  // Shape: [{ sectionId, claim, expectedSource }]
  detectedHallucinations: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),

  // ── Phase 6: Media ────────────────────────────────────────
  // Generated media: { [sectionId]: { prompt, s3Url, altText } }
  generatedMedia: Annotation({
    reducer: (existing, update) => ({ ...existing, ...update }),
    default: () => ({}),
  }),

  // ── Phase 7: Assembly & Publishing ───────────────────────
  // The fully assembled Markdown document
  assembledDocument: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // User feedback after presentToUser
  // Shape: { typos[], rewrites[], newSections[], scopeDrift, satisfied }
  userFeedback: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // 0.0 = on-brief, 1.0 = completely different article requested
  scopeDrift: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => 0.0,
  }),

  // Live URL after successful publish
  publishedUrl: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // ── Token Tracking ─────────────────────────────────────────
  // Running total of tokens consumed this project
  totalTokensUsed: Annotation({
    reducer: (current, update) => (current || 0) + (update || 0),  // Accumulator
    default: () => 0,
  }),

  // Per-agent token log: [{ agent, tokens, model, timestamp }]
  tokenLog: Annotation({
    reducer: (existing, update) => [...existing, ...update],  // Append
    default: () => [],
  }),

  // Estimated cost in USD
  estimatedCostUsd: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => 0.0,
  }),

  // ── System Control ─────────────────────────────────────────
  // Current graph status
  // 'running' | 'awaiting_human' | 'paused_budget' | 'escalated' | 'complete' | 'error'
  graphStatus: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => 'running',
  }),

  // Workspace health check results
  // Shape: { openai, dalle, pinecone, cms, allHealthy }
  workspaceHealth: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Snapshot versions saved: [{ version, sectionId, savedAt }]
  snapshots: Annotation({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),

  // Escalation reason (set when graph pauses for human)
  escalationReason: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),

  // Error log: [{ node, error, timestamp }]
  errors: Annotation({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),

  // Conversation messages (for humanInput node)
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

// ── Helper: Create initial state for a new project ─────────
export function createInitialState(projectId, workspaceId, rawBrief) {
  return {
    projectId,
    workspaceId,
    rawBrief,
    graphStatus: 'running',
  };
}
