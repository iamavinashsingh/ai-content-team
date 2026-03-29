// ── Agent Definitions ─────────────────────────────────────
export const AGENTS = [
  {
    id: 'pm',
    name: 'PM Strategist',
    description: 'Parses briefs, generates clarifying questions, builds strategy',
    icon: 'psychology',
    color: '#8ff5ff',
    colorName: 'cyan',
    glowClass: 'glow-cyan',
    nodes: ['pmStrategist', 'humanInput'],
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Web research, source scraping, knowledge embedding',
    icon: 'travel_explore',
    color: '#c081ff',
    colorName: 'violet',
    glowClass: 'glow-violet',
    nodes: ['researchStep1', 'researchStep2', 'architectOutline', 'blueprintValidator'],
  },
  {
    id: 'writer',
    name: 'Writer',
    description: 'Context-aware section drafting with RAG pipeline',
    icon: 'edit_note',
    color: '#4ade80',
    colorName: 'emerald',
    glowClass: 'glow-emerald',
    nodes: [
      'plannerAgent', 'setupWorkspace', 'workspaceHealthCheck',
      'selectNextTask', 'contextBuilder', 'writerAgent',
      'updateRegistry', 'simplifyTask', 'stateCompactor', 'brandVoiceExtractor',
    ],
  },
  {
    id: 'editor',
    name: 'Editor',
    description: 'Editorial review, fact-checking, media generation',
    icon: 'auto_fix_high',
    color: '#fbbf24',
    colorName: 'amber',
    glowClass: 'glow-amber',
    nodes: ['editorAgent', 'factCheckValidator', 'phaseVerification', 'snapshotManager', 'mediaAgent'],
  },
  {
    id: 'publisher',
    name: 'Publisher',
    description: 'Document assembly, user review, CMS publishing',
    icon: 'send',
    color: '#fb7185',
    colorName: 'rose',
    glowClass: 'glow-rose',
    nodes: [
      'documentAssembler', 'presentToUser', 'feedbackCollector',
      'feedbackRouter', 'humanEscalation', 'publisherAgent',
    ],
  },
];

// ── Reverse lookup: node name → agent id ──────────────────
export const NODE_TO_AGENT = {};
AGENTS.forEach((agent) => {
  agent.nodes.forEach((node) => {
    NODE_TO_AGENT[node] = agent.id;
  });
});

// ── Human-friendly node names ─────────────────────────────
export const NODE_LABELS = {
  pmStrategist: 'Analyzing Brief',
  humanInput: 'Awaiting Input',
  researchStep1: 'Generating Queries',
  researchStep2: 'Scraping Sources',
  architectOutline: 'Designing Outline',
  blueprintValidator: 'Validating Blueprint',
  plannerAgent: 'Planning Tasks',
  setupWorkspace: 'Setting Up Workspace',
  workspaceHealthCheck: 'Health Check',
  selectNextTask: 'Selecting Task',
  contextBuilder: 'Building Context',
  writerAgent: 'Writing Section',
  updateRegistry: 'Updating Registry',
  editorAgent: 'Editing Draft',
  factCheckValidator: 'Fact-Checking',
  mediaAgent: 'Generating Media',
  snapshotManager: 'Saving Snapshot',
  phaseVerification: 'Verifying Phase',
  brandVoiceExtractor: 'Extracting Voice',
  stateCompactor: 'Compacting State',
  simplifyTask: 'Simplifying Task',
  documentAssembler: 'Assembling Document',
  presentToUser: 'Preparing Preview',
  feedbackCollector: 'Collecting Feedback',
  feedbackRouter: 'Routing Feedback',
  humanEscalation: 'Escalating to Human',
  publisherAgent: 'Publishing Article',
};

export const API_BASE = '/api/v1';
