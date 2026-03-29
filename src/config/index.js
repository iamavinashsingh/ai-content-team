// src/config/index.js
// ============================================================
// Central Configuration
// All constants, model routing rules, and environment 
// validation live here. Import from this file, never 
// directly from process.env in agent files.
// ============================================================

import 'dotenv/config';

// ── Validate required env vars on startup ──────────────────
const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX_NAME',
  'DATABASE_URL',
];

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
      `Copy .env.example to .env and fill in all values.`
    );
  }
  console.log('[Config] ✅ All required environment variables present.');
}

// ── OpenAI Model Routing ───────────────────────────────────
// Design decision: expensive GPT-4o only for tasks that need
// deep reasoning. Routing/classification tasks use mini.
export const MODELS = {
  // High-capability: used by Writer, Editor, FactChecker, Architect
  SMART: 'gpt-4o',

  // Fast & cheap: used by Router, Planner, Registry updater
  FAST: 'gpt-4o-mini',

  // Image generation
  IMAGE: 'dall-e-3',
};

// Which agent uses which model
export const AGENT_MODEL_MAP = {
  pmStrategist:        MODELS.SMART,   // Needs deep understanding of brief
  researchStep1:       MODELS.FAST,    // Just generating search queries
  architectOutline:    MODELS.SMART,   // Complex structural reasoning
  blueprintValidator:  MODELS.FAST,    // Checklist validation
  plannerAgent:        MODELS.FAST,    // Dependency ordering
  writerAgent:         MODELS.SMART,   // Core writing — max quality
  editorAgent:         MODELS.SMART,   // Nuanced editorial judgment
  factCheckValidator:  MODELS.FAST,    // Structured claim extraction
  brandVoiceExtractor: MODELS.FAST,    // Pattern extraction
  stateCompactor:      MODELS.FAST,    // Summarization
  updateRegistry:      MODELS.FAST,    // 2-sentence summaries
  feedbackRouter:      MODELS.FAST,    // Simple routing decision
  publisherAgent:      MODELS.FAST,    // HTML formatting
  mediaAgent:          MODELS.FAST,    // Prompt generation (DALL-E is separate)
};

// ── Token Budget ───────────────────────────────────────────
export const TOKEN_BUDGET = {
  // Hard limit: graph auto-pauses at this threshold
  MAX_PER_PROJECT: parseInt(process.env.MAX_TOKENS_PER_PROJECT || '50000', 10),

  // Soft warning: user gets alerted at this threshold
  WARN_THRESHOLD: parseInt(process.env.WARN_TOKENS_THRESHOLD || '40000', 10),

  // Per-section context budget fed to writerAgent (Node 11 design spec)
  CONTEXT_PER_SECTION: 1500,

  // Per-call limits by agent type
  MAX_TOKENS_PER_CALL: {
    writerAgent:         2000,
    editorAgent:         1000,
    factCheckValidator:  800,
    brandVoiceExtractor: 600,
    stateCompactor:      500,
    default:             800,
  },
};

// ── Loop Guards ────────────────────────────────────────────
// Max retry counts before escalation (prevents infinite loops)
export const LOOP_LIMITS = {
  blueprintValidatorRetries: 4,   // Node 6: outline rewrite max (increased to avoid premature escalation)
  editorAgentRejections:     2,   // Node 14: before → simplifyTask
  factCheckRewrites:         2,   // Node 15: before → humanEscalation
  workspaceHealthRetries:    1,   // Node 9: before → humanEscalation
};

// ── Database ───────────────────────────────────────────────
export const DB_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Neon
  max: 10,          // Connection pool max
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// ── Pinecone ───────────────────────────────────────────────
export const PINECONE_CONFIG = {
  apiKey:    process.env.PINECONE_API_KEY,
  indexName: process.env.PINECONE_INDEX_NAME,
  // Embedding dimensions for text-embedding-3-small
  dimension: 1536,
  metric:    'cosine',
  // Metadata fields stored with each vector (Section 7 of design doc)
  metadataFields: ['text_chunk', 'source_url', 'date_scraped', 'keyword_tags', 'project_id'],
};

// ── External Services ──────────────────────────────────────
export const SERVICES = {
  tavily:     { apiKey: process.env.TAVILY_API_KEY },
  firecrawl:  { apiKey: process.env.FIRECRAWL_API_KEY },
  wordpress: {
    url:         process.env.WORDPRESS_URL,
    username:    process.env.WORDPRESS_USERNAME,
    appPassword: process.env.WORDPRESS_APP_PASSWORD,
  },
  ghost: {
    url:          process.env.GHOST_URL,
    adminApiKey:  process.env.GHOST_ADMIN_API_KEY,
  },
  s3: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region:          process.env.AWS_REGION || 'us-east-1',
    bucket:          process.env.AWS_S3_BUCKET,
  },
};

// ── App ────────────────────────────────────────────────────
export const APP_CONFIG = {
  port:        parseInt(process.env.PORT || '3001', 10),
  nodeEnv:     process.env.NODE_ENV || 'development',
  isDev:       process.env.NODE_ENV !== 'production',
  appSecret:   process.env.APP_SECRET || 'dev-secret-change-in-prod',
};
