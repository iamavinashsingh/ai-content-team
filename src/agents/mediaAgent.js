// src/agents/mediaAgent.js
// ============================================================
// Node 16: Media Agent
//
// Responsibilities:
//  - Check if the verified section requires media
//  - Generate a highly specific DALL-E 3 prompt based on the
//    FINAL verified text (not just the section title)
//  - Generate the image via DALL-E 3 API
//  - Upload to S3 and return the CDN URL
//  - Track DALL-E cost separately (flat-rate per image)
//
// State reads:  draftedSections, activeTaskIds, taskQueue,
//               structuredBrief
// State writes: generatedMedia, taskQueue, draftedSections
// Model:        GPT-4o-mini (prompt gen) + DALL-E 3 (image)
//
// Design doc: "Image prompts verified against FINAL section text"
// Loophole fix #9: "Media Mismatch — Images don't fit text"
// ============================================================

import { ChatOpenAI } from '@langchain/openai';
import { OpenAI } from 'openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AGENT_MODEL_MAP, MODELS, TOKEN_BUDGET, SERVICES } from '../config/index.js';
import { trackTokenUsage } from '../utils/tokenTracker.js';

const MODEL = AGENT_MODEL_MAP.mediaAgent;

const PROMPT_GEN_SYSTEM = `You are an AI art director. Generate a DALL-E 3 image prompt 
that visually represents the key concept of the provided article section.

Rules:
- The prompt must directly reflect content in the provided text
- Style: professional, clean, editorial illustration or photography style
- No text, logos, or watermarks in the image
- Avoid clichés (no "businessman shaking hands", "lightbulb for ideas")
- Be specific about colors, composition, and mood
- Keep it under 200 words

RESPOND WITH VALID JSON ONLY:
{
  "prompt": "Detailed DALL-E 3 image prompt here",
  "style": "photographic | illustration | diagram | infographic",
  "altText": "Accessible description for the image (screen readers)"
}`;

// ── Upload image buffer to S3 ──────────────────────────────
async function uploadToS3(imageBuffer, projectId, sectionId, mimeType = 'image/png') {
  if (!SERVICES.s3.accessKeyId || !SERVICES.s3.bucket) {
    // Return null if S3 not configured so we fall back to the raw DALL-E URL
    return null;
  }

  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const s3 = new S3Client({
      region:      SERVICES.s3.region,
      credentials: {
        accessKeyId:     SERVICES.s3.accessKeyId,
        secretAccessKey: SERVICES.s3.secretAccessKey,
      },
    });

    const key = `${projectId}/images/${sectionId}-${Date.now()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket:      SERVICES.s3.bucket,
      Key:         key,
      Body:        imageBuffer,
      ContentType: mimeType,
    }));

    return `https://${SERVICES.s3.bucket}.s3.${SERVICES.s3.region}.amazonaws.com/${key}`;
  } catch (err) {
    console.warn(`[mediaAgent] S3 upload failed: ${err.message}`);
    return null;
  }
}

export async function mediaAgentNode(state) {
  const { draftedSections, activeTaskIds, taskQueue, structuredBrief } = state;

  if (!activeTaskIds?.length) return {};

  // Find the verified section
  const activeTask = taskQueue?.find(
    (t) => activeTaskIds.includes(t.taskId) && t.status === 'verified'
  );

  if (!activeTask) {
    console.warn('[mediaAgent] No verified task found');
    return {};
  }

  // Skip if section doesn't need media
  if (!activeTask.requiresMedia) {
    console.log(`[mediaAgent] Section "${activeTask.heading}" — no media required, skipping`);

    // Still mark as media_done so the pipeline continues
    const updatedQueue = (state.taskQueue || []).map((t) =>
      t.taskId === activeTask.taskId ? { ...t, status: 'media_done' } : t
    );
    return { taskQueue: updatedQueue };
  }

  const drafted = draftedSections?.[activeTask.sectionId];
  if (!drafted) return {};

  console.log(`[mediaAgent] Generating media for: "${drafted.heading}"`);

  const llm = new ChatOpenAI({
    model:       MODEL,
    temperature: 0.6,
    maxTokens:   TOKEN_BUDGET.MAX_TOKENS_PER_CALL.default,
  });

  // ── Step 1: Generate DALL-E prompt from actual text ───
  let promptData;
  let promptInputTokens = 0, promptOutputTokens = 0;

  try {
    const response = await llm.invoke([
      new SystemMessage(PROMPT_GEN_SYSTEM),
      new HumanMessage(
        `Section heading: "${drafted.heading}"\n` +
        `Section hint: ${activeTask.mediaHint || 'none'}\n` +
        `Article tone: ${structuredBrief.tone}\n\n` +
        `Section text (generate a prompt that visually represents THIS content):\n` +
        `${drafted.rawText.slice(0, 800)}`
      ),
    ]);

    promptInputTokens  = response.usage_metadata?.input_tokens  || 0;
    promptOutputTokens = response.usage_metadata?.output_tokens || 0;

    const cleaned = response.content.trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    promptData = JSON.parse(cleaned);
  } catch (err) {
    console.error('[mediaAgent] Prompt generation failed:', err.message);
    // Skip media for this section rather than blocking the pipeline
    const updatedQueue = (state.taskQueue || []).map((t) =>
      t.taskId === activeTask.taskId ? { ...t, status: 'media_done' } : t
    );
    return { taskQueue: updatedQueue };
  }

  await trackTokenUsage({
    projectId: state.projectId,
    agentName: 'mediaAgent_promptGen',
    model:     MODEL,
    inputTokens:  promptInputTokens,
    outputTokens: promptOutputTokens,
  });

  console.log(`[mediaAgent] Prompt: "${promptData.prompt.slice(0, 100)}..."`);

  // ── Step 2: Generate image via DALL-E 3 ───────────────
  let imageUrl  = null;
  let s3Url     = null;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const imageResponse = await openai.images.generate({
      model:   MODELS.IMAGE,
      prompt:  promptData.prompt,
      n:       1,
      size:    '1024x1024',
      quality: 'standard',
      response_format: 'url',
    });

    imageUrl = imageResponse.data[0]?.url;
    console.log(`[mediaAgent] DALL-E 3 image generated: ${imageUrl?.slice(0, 60)}...`);

    // Track image cost (flat rate, not token-based)
    await trackTokenUsage({
      projectId:    state.projectId,
      agentName:    'mediaAgent_dalle3',
      model:        MODELS.IMAGE,
      inputTokens:  0,
      outputTokens: 0,
      isImage:      true,
      imageQuality: 'standard',
    });

    // ── Step 3: Fetch image and upload to S3 ─────────────
    if (imageUrl) {
      const imgResponse = await fetch(imageUrl);
      const imgBuffer   = Buffer.from(await imgResponse.arrayBuffer());
      s3Url = await uploadToS3(imgBuffer, state.projectId, activeTask.sectionId);
      console.log(`[mediaAgent] Image stored: ${s3Url}`);
    }
  } catch (err) {
    // DALL-E can reject prompts for safety — handle gracefully
    console.warn(`[mediaAgent] Image generation failed (safety/error): ${err.message}`);
    // Continue without image — don't block the pipeline
  }

  // ── Update state ───────────────────────────────────────
  const updatedQueue = (state.taskQueue || []).map((t) =>
    t.taskId === activeTask.taskId ? { ...t, status: 'media_done' } : t
  );

  return {
    generatedMedia: {
      [activeTask.sectionId]: {
        dallePrompt: promptData.prompt,
        style:       promptData.style,
        altText:     promptData.altText,
        originalUrl: imageUrl,
        s3Url:       s3Url || imageUrl,   // Fall back to DALL-E URL if S3 fails
        generatedAt: new Date().toISOString(),
      },
    },
    taskQueue: updatedQueue,
    draftedSections: {
      [activeTask.sectionId]: {
        ...drafted,
        status:   'media_done',
        mediaUrl: s3Url || imageUrl || null,
      },
    },
  };
}
