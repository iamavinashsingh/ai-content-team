// src/agents/pmStrategist.js
// ============================================================
// Node 1: PM Strategist Agent
//
// Responsibilities:
//  - Parse the raw user brief
//  - Detect missing information (audience, tone, length, CMS)
//  - Generate clarifying questions if critical info is missing
//  - OR produce a fully structured brief if enough info exists
//
// State reads:  rawBrief, clarifyingAnswers
// State writes: structuredBrief, clarifyingQuestions, briefStatus
// Model:        GPT-4o (deep understanding required)
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';
import { updateProject } from '../database/index.js';

const MODEL = AGENT_MODEL_MAP.pmStrategist;

const PM_SYSTEM_PROMPT = `You are a senior content strategist at a top digital marketing agency.

Analyze a content brief and either ask clarifying questions OR produce a structured brief.

A brief is READY if it contains or allows you to infer:
- Topic / headline direction
- Target audience (even broadly — "general readers" is fine)
- Desired tone (default: "professional" if not stated)
- Approximate length (default: 1800 words if not stated)
- At least 3 SEO keywords (derive from topic if not given)
- CMS target (default: "none" if not stated)

Only request clarification if the topic is too vague to proceed at all.

RESPOND WITH VALID JSON ONLY. No markdown fences, no explanation.

Format when clarification needed:
{
  "status": "needs_clarification",
  "questions": [
    { "id": "q1", "question": "...", "reason": "why this matters" }
  ]
}

Format when brief is ready:
{
  "status": "brief_ready",
  "brief": {
    "title": "Working article title",
    "topic": "Core topic in one sentence",
    "targetAudience": "Who this is for",
    "tone": "authoritative | friendly | technical | casual | persuasive",
    "angle": "Unique hook or angle for this piece",
    "desiredLength": 1800,
    "seoKeywords": ["kw1", "kw2", "kw3", "kw4", "kw5"],
    "cmsTarget": "wordpress | ghost | none",
    "contentType": "blog_post | landing_page | how_to | listicle | opinion | product_review",
    "additionalNotes": "Any constraints or special requirements"
  }
}`;

export async function pmStrategistNode(state) {
  console.log('[pmStrategist] Analyzing content brief...');

  const llm = new ChatOpenAI({
    model: MODEL,
    temperature: 0.3,
    maxTokens: TOKEN_BUDGET.MAX_TOKENS_PER_CALL.default,
  });

  // If we have clarifying answers, include them in the prompt
  let userContent = `Content Brief:\n${state.rawBrief}`;
  if (state.clarifyingAnswers) {
    userContent += `\n\nUser answered the clarifying questions:\n${state.clarifyingAnswers}`;
  }

  let response;
  try {
    response = await llm.invoke([
      new SystemMessage(PM_SYSTEM_PROMPT),
      new HumanMessage(userContent),
    ]);
  } catch (err) {
    console.error('[pmStrategist] LLM call failed:', err.message);
    return {
      errors: [{ node: 'pmStrategist', error: err.message, timestamp: new Date().toISOString() }],
      graphStatus: 'error',
    };
  }

  // Track tokens
  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'pmStrategist',
    model:        MODEL,
    inputTokens:  response.usage_metadata?.input_tokens  || 0,
    outputTokens: response.usage_metadata?.output_tokens || 0,
  });

  // Parse JSON response
  let parsed;
  try {
    const cleaned = response.content.trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[pmStrategist] JSON parse failed:', response.content?.slice(0, 200));
    return {
      errors: [{ node: 'pmStrategist', error: `JSON parse failed: ${err.message}`, timestamp: new Date().toISOString() }],
      graphStatus: 'error',
    };
  }

  // ── Route: needs clarification ─────────────────────────
  if (parsed.status === 'needs_clarification') {
    console.log(`[pmStrategist] ${parsed.questions.length} clarifying question(s) generated`);
    return {
      briefStatus:         'needs_clarification',
      clarifyingQuestions: parsed.questions,
      graphStatus:         'awaiting_human',
      ...tokenUpdate,
    };
  }

  // ── Route: brief ready ─────────────────────────────────
  if (parsed.status === 'brief_ready') {
    console.log(`[pmStrategist] Brief ready — "${parsed.brief.title}"`);
    console.log(`[pmStrategist] Keywords: ${parsed.brief.seoKeywords.join(', ')}`);

    // Persist to DB
    await updateProject(state.projectId, {
      title:            parsed.brief.title,
      structured_brief: parsed.brief,
      status:           'researching',
    });

    return {
      briefStatus:        'brief_ready',
      structuredBrief:    parsed.brief,
      clarifyingQuestions: [],
      graphStatus:        'running',
      ...tokenUpdate,
    };
  }

  return {
    errors: [{ node: 'pmStrategist', error: `Unexpected status: ${parsed.status}`, timestamp: new Date().toISOString() }],
    graphStatus: 'error',
  };
}
