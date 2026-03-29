// src/agents/architectOutline.js
// ============================================================
// Node 5: Architect Outline Agent
//
// Responsibilities:
//  - Design the complete article structure (H1, H2s, H3s)
//  - Assign target word counts per section
//  - Identify where images/infographics are needed
//  - Embed SEO keywords naturally into heading choices
//
// State reads:  structuredBrief, scrapedSources, outlineRetryCount,
//               outlineValidation (for retry context)
// State writes: outline
// Model:        GPT-4o (complex structural reasoning)
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.architectOutline;

const ARCHITECT_SYSTEM_PROMPT = `You are a senior content architect and SEO strategist.

Design a complete article structure that:
1. Has a compelling H1 title containing the primary keyword
2. Uses H2 sections as major topic pillars (3-6 sections)  
3. Uses H3 sub-sections to break down complex H2s (optional)
4. Distributes word count logically (intro ~150w, body sections ~300-500w each, conclusion ~200w)
5. Places media strategically (hero image, mid-article diagrams, etc.)
6. Ensures logical narrative flow: hook → problem → solution → proof → CTA

SEO Rules:
- Primary keyword must appear in H1
- Distribute secondary keywords across H2s
- At least one FAQ or "what is" section if the topic warrants it

RESPOND WITH VALID JSON ONLY:
{
  "h1": "The main article title",
  "metaDescription": "155-character SEO meta description",
  "totalTargetWords": 1800,
  "sections": [
    {
      "id": "section_1",
      "heading": "Section heading text",
      "level": 2,
      "targetWordCount": 200,
      "requiresMedia": true,
      "mediaHint": "Hero image showing X",
      "keywords": ["kw1", "kw2"],
      "purpose": "Hook and introduce the topic",
      "subsections": [
        {
          "id": "section_1_1",
          "heading": "Subsection heading",
          "level": 3,
          "targetWordCount": 150,
          "requiresMedia": false,
          "keywords": ["kw3"],
          "purpose": "Explain X in detail"
        }
      ]
    }
  ]
}`;

export async function architectOutlineNode(state) {
  const brief = state.structuredBrief;
  const retryCount = state.outlineRetryCount || 0;

  console.log(`[architectOutline] Designing outline${retryCount > 0 ? ` (retry #${retryCount})` : ''}...`);

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.4,
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.writerAgent,
  });

  // Build prompt with retry context if this is a second attempt
  let userPrompt = `Article Brief:
Title: ${brief.title}
Topic: ${brief.topic}
Angle: ${brief.angle}
Target Audience: ${brief.targetAudience}
Tone: ${brief.tone}
Desired Length: ${brief.desiredLength} words
SEO Keywords: ${brief.seoKeywords.join(', ')}
Content Type: ${brief.contentType}

Research Sources Available:
${(state.scrapedSources || []).slice(0, 5).map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join('\n')}

Design a complete article outline following the JSON schema.`;

  // On retry: include the validation issues so the LLM can fix them
  if (retryCount > 0 && state.outlineValidation?.issues) {
    userPrompt += `\n\nPREVIOUS OUTLINE FAILED VALIDATION. Fix these issues:\n`;
    userPrompt += state.outlineValidation.issues.map((i) => `- ${i}`).join('\n');
  }

  let response;
  try {
    response = await llm.invoke([
      new SystemMessage(ARCHITECT_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
  } catch (err) {
    console.error('[architectOutline] LLM call failed:', err.message);
    return {
      errors: [{ node: 'architectOutline', error: err.message, timestamp: new Date().toISOString() }],
      graphStatus: 'error',
    };
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'architectOutline',
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
    console.error('[architectOutline] JSON parse failed');
    return {
      errors: [{ node: 'architectOutline', error: `JSON parse: ${err.message}`, timestamp: new Date().toISOString() }],
      graphStatus: 'error',
    };
  }

  // Flatten subsections into the section list for easier downstream access
  const flatSections = [];
  for (const section of parsed.sections) {
    flatSections.push({
      id:             section.id,
      heading:        section.heading,
      level:          section.level,
      targetWordCount:section.targetWordCount,
      requiresMedia:  section.requiresMedia,
      mediaHint:      section.mediaHint || null,
      keywords:       section.keywords || [],
      purpose:        section.purpose || '',
      parentId:       null,
    });

    if (section.subsections) {
      for (const sub of section.subsections) {
        flatSections.push({
          ...sub,
          requiresMedia: sub.requiresMedia || false,
          mediaHint:     sub.mediaHint || null,
          keywords:      sub.keywords || [],
          purpose:       sub.purpose || '',
          parentId:      section.id,
        });
      }
    }
  }

  const outline = {
    h1:               parsed.h1,
    metaDescription:  parsed.metaDescription,
    totalTargetWords: parsed.totalTargetWords,
    sections:         flatSections,
  };

  const totalWords = flatSections.reduce((sum, s) => sum + (s.targetWordCount || 0), 0);
  console.log(`[architectOutline] Outline ready: ${flatSections.length} sections, ~${totalWords} total words`);

  return {
    outline,
    outlineRetryCount: retryCount + 1,
    ...tokenUpdate,
  };
}
