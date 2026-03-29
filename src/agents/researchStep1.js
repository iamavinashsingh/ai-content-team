// src/agents/researchStep1.js
// ============================================================
// Node 3: Research Step 1 — Search Query Generator
//
// Responsibilities:
//  - Takes the structured brief from pmStrategist
//  - Uses GPT-4o-mini to generate 5-10 highly targeted
//    search queries designed to find the best source material
//  - Queries cover: core topic, statistics, competitor analysis,
//    expert opinions, recent news/updates
//
// State reads:  structuredBrief
// State writes: searchQueries
// Model:        GPT-4o-mini (simple generation task)
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.researchStep1;

const RESEARCH_QUERY_PROMPT = `You are a research strategist. Generate search queries to find the best source material for an article.

Create 8 targeted search queries that together will gather:
1. Core explanations and definitions of the topic
2. Recent statistics and data points (include current year)
3. Expert opinions and quotes
4. Real-world examples and case studies
5. Common misconceptions or counterarguments
6. Recent news or developments on the topic
7. "How to" or practical implementation angles
8. Competitor or alternative approaches

Make queries specific and varied. Avoid generic queries.
Use the SEO keywords naturally in some queries.

RESPOND WITH VALID JSON ONLY:
{
  "queries": [
    { "query": "search query text", "intent": "what this query finds" },
    ...
  ]
}`;

export async function researchStep1Node(state) {
  const brief = state.structuredBrief;
  console.log(`[researchStep1] Generating search queries for: "${brief.title}"`);

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.4,
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.default,
  });

  const userPrompt = `Article Brief:
Title: ${brief.title}
Topic: ${brief.topic}
Angle: ${brief.angle}
Target Audience: ${brief.targetAudience}
SEO Keywords: ${brief.seoKeywords.join(', ')}
Content Type: ${brief.contentType}

Generate 8 search queries to find the best research material for this article.`;

  let response;
  try {
    response = await llm.invoke([
      new SystemMessage(RESEARCH_QUERY_PROMPT),
      new HumanMessage(userPrompt),
    ]);
  } catch (err) {
    console.error('[researchStep1] LLM call failed:', err.message);
    return {
      errors: [{ node: 'researchStep1', error: err.message, timestamp: new Date().toISOString() }],
      graphStatus: 'error',
    };
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'researchStep1',
    model:        MODEL,
    inputTokens:  response.usage_metadata?.input_tokens  || 0,
    outputTokens: response.usage_metadata?.output_tokens || 0,
  });

  let parsed;
  try {
    const cleaned = response.content.trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[researchStep1] JSON parse failed:', response.content?.slice(0, 200));
    return {
      errors: [{ node: 'researchStep1', error: `JSON parse: ${err.message}`, timestamp: new Date().toISOString() }],
      graphStatus: 'error',
    };
  }

  const queries = parsed.queries.map((q) => q.query);
  console.log(`[researchStep1] Generated ${queries.length} search queries:`);
  queries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  return {
    searchQueries: queries,
    ...tokenUpdate,
  };
}
