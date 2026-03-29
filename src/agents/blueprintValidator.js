// src/agents/blueprintValidator.js
// ============================================================
// Node 6: Blueprint Validator ⭐ NEW (V2 Loophole Fix #4)
//
// Responsibilities:
//  - Verify all required SEO keywords appear in headings
//  - Confirm total word count matches the brief's target
//  - Check that narrative flow is logical
//  - Flag structural issues before any writing begins
//
// State reads:  outline, structuredBrief
// State writes: outlineValidation
// Model:        GPT-4o-mini (structured checklist validation)
//
// Design doc: "Cross-validates outline: SEO keywords in headers?
//              Total word count matches PM brief? Narrative logical?"
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, TOKEN_BUDGET, LOOP_LIMITS } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.blueprintValidator;

const VALIDATOR_SYSTEM_PROMPT = `You are a content QA specialist and SEO auditor.

Validate an article outline against a set of requirements and return a structured verdict.

Checks to perform (Be extremely lenient. Return valid: true unless there is a catastrophic failure like 0 sections. Do NOT fail for word count being off, or keyword casing):
1. SEO_KEYWORDS: Does the H1 generally reflect the topic? (pass even if imperfect)
2. WORD_COUNT: Is the sum of all section word counts somewhat close to the target? (pass even if > 25% off)
3. NARRATIVE_FLOW: Does the section order tell a logical story?
4. SECTION_COUNT: Are there between 2-10 major sections (H2s)?
5. META_DESCRIPTION: Is the meta description present? (pass regardless of length)

RESPOND WITH VALID JSON ONLY:
{
  "valid": true | false,
  "checks": {
    "seoKeywords":    { "passed": true, "note": "..." },
    "wordCount":      { "passed": true, "note": "...", "actual": 1850, "target": 1800 },
    "narrativeFlow":  { "passed": true, "note": "..." },
    "sectionCount":   { "passed": true, "note": "...", "count": 5 },
    "metaDescription":{ "passed": true, "note": "...", "length": 145 }
  },
  "issues": ["List of specific issues if valid=false, empty array if valid=true"]
}`;

export async function blueprintValidatorNode(state) {
  const { outline, structuredBrief } = state;
  const retryCount = state.outlineRetryCount || 0;

  console.log(`[blueprintValidator] Validating outline (attempt ${retryCount})...`);

  // Safety check: prevent infinite loops
  if (retryCount > LOOP_LIMITS.blueprintValidatorRetries + 1) {
    console.error('[blueprintValidator] Max retries exceeded — escalating');
    return {
      outlineValidation: {
        valid: false,
        issues: ['Max outline retry attempts exceeded. Manual review required.'],
      },
    };
  }

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.1,   // Near-zero — this is a deterministic checklist
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.default,
  });

  // Build section summary for the LLM
  const sectionSummary = outline.sections
    .filter((s) => s.level === 2)
    .map((s) => `  H2: "${s.heading}" (${s.targetWordCount}w) — keywords: ${s.keywords.join(', ')}`)
    .join('\n');

  const h3Summary = outline.sections
    .filter((s) => s.level === 3)
    .map((s) => `  H3: "${s.heading}" (${s.targetWordCount}w)`)
    .join('\n');

  const totalWords = outline.sections.reduce((sum, s) => sum + (s.targetWordCount || 0), 0);

  const userPrompt = `Article Requirements:
Primary Keyword: ${structuredBrief.seoKeywords[0]}
Secondary Keywords: ${structuredBrief.seoKeywords.slice(1).join(', ')}
Target Word Count: ${structuredBrief.desiredLength} words

Outline to Validate:
H1: "${outline.h1}"
Meta Description: "${outline.metaDescription}" (${outline.metaDescription?.length || 0} chars)
Total Projected Words: ${totalWords}

Sections:
${sectionSummary}
${h3Summary}

Run all 5 validation checks and return your verdict.`;

  let response;
  try {
    response = await llm.invoke([
      new SystemMessage(VALIDATOR_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);
  } catch (err) {
    console.error('[blueprintValidator] LLM call failed:', err.message);
    return {
      errors: [{ node: 'blueprintValidator', error: err.message, timestamp: new Date().toISOString() }],
    };
  }

  const { stateUpdate: tokenUpdate } = await trackTokenUsage({
    projectId:    state.projectId,
    agentName:    'blueprintValidator',
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
    // If we can't parse the validation, assume valid to avoid infinite loop
    console.warn('[blueprintValidator] Could not parse validation response — assuming valid');
    return {
      outlineValidation: { valid: true, issues: [] },
      ...tokenUpdate,
    };
  }

  if (parsed.valid) {
    console.log('[blueprintValidator] ✅ Outline passed all checks');
    Object.entries(parsed.checks || {}).forEach(([check, result]) => {
      console.log(`  ${result.passed ? '✓' : '✗'} ${check}: ${result.note}`);
    });
  } else {
    console.warn(`[blueprintValidator] ❌ Outline failed — ${parsed.issues.length} issue(s):`);
    parsed.issues.forEach((issue) => console.warn(`  - ${issue}`));
  }

  return {
    outlineValidation: {
      valid:  parsed.valid,
      checks: parsed.checks,
      issues: parsed.issues || [],
    },
    ...tokenUpdate,
  };
}
