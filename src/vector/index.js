// src/vector/index.js
// ============================================================
// Pinecone Vector Store
//
// Responsibilities:
//  - Initialize Pinecone client and index connection
//  - Embed text using OpenAI text-embedding-3-small
//  - Upsert research chunks (used by researchStep2)
//  - Query by semantic similarity (used by contextBuilder)
//  - Query for fact verification (used by factCheckValidator)
//  - Delete all vectors for a project (cleanup)
// ============================================================

import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PINECONE_CONFIG } from '../config/index.js';

// ── Singletons ─────────────────────────────────────────────
let pineconeClient = null;
let pineconeIndex   = null;
let embedder        = null;

function getPineconeClient() {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: PINECONE_CONFIG.apiKey });
  }
  return pineconeClient;
}

function getPineconeIndex() {
  if (!pineconeIndex) {
    pineconeIndex = getPineconeClient().index(PINECONE_CONFIG.indexName);
  }
  return pineconeIndex;
}

function getEmbedder() {
  if (!embedder) {
    embedder = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',   // 1536 dimensions, cost-effective
      batchSize: 512,
    });
  }
  return embedder;
}

// ── Health Check ───────────────────────────────────────────
// Used by workspaceHealthCheck node (Node 9)
export async function checkPineconeHealth() {
  try {
    const client = getPineconeClient();
    const indexes = await client.listIndexes();
    const exists = indexes.indexes?.some(
      (idx) => idx.name === PINECONE_CONFIG.indexName
    );
    if (!exists) {
      return {
        healthy: false,
        error: `Index "${PINECONE_CONFIG.indexName}" not found. Create it in your Pinecone dashboard.`,
      };
    }
    return { healthy: true, indexName: PINECONE_CONFIG.indexName };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

// ── Embed & Upsert Research ───────────────────────────────
// Called by researchStep2 (Node 4) after scraping articles
//
// chunks: Array of {
//   text_chunk:   string,   — The paragraph/sentence
//   source_url:   string,   — Where it came from
//   date_scraped: string,   — ISO timestamp
//   keyword_tags: string[], — Matched SEO keywords
//   project_id:   string,   — Namespace isolation
// }
export async function upsertResearchChunks(chunks, projectId) {
  if (!chunks || chunks.length === 0) return { upserted: 0 };

  const index = getPineconeIndex();
  const embedderInstance = getEmbedder();

  // Split into batches of 100 (Pinecone upsert limit)
  const BATCH_SIZE = 100;
  let totalUpserted = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // Generate embeddings for this batch
    const texts = batch.map((c) => c.text_chunk);
    const embeddings = await embedderInstance.embedDocuments(texts);

    // Build Pinecone vector records
    const vectors = batch.map((chunk, idx) => ({
      id: `${projectId}-${Date.now()}-${i + idx}`,
      values: embeddings[idx],
      metadata: {
        text_chunk:   chunk.text_chunk,
        source_url:   chunk.source_url,
        date_scraped: chunk.date_scraped || new Date().toISOString(),
        keyword_tags: (chunk.keyword_tags || []).join(','),  // Pinecone metadata is string
        project_id:   projectId,
      },
    }));

    // Use project namespace for isolation
    await index.namespace(projectId).upsert(vectors);
    totalUpserted += batch.length;
    console.log(`[Pinecone] Upserted batch ${Math.ceil(i / BATCH_SIZE) + 1} — ${batch.length} chunks`);
  }

  return { upserted: totalUpserted };
}

// ── Query Research by Section ──────────────────────────────
// Called by contextBuilder (Node 11)
// Returns the most relevant research chunks for a section heading
//
// sectionHeading: string  — The H2/H3 we're about to write
// projectId:      string  — Namespace to search in
// topK:           number  — How many chunks to return (default 5)
export async function queryResearchForSection(sectionHeading, projectId, topK = 5) {
  const index = getPineconeIndex();
  const embedderInstance = getEmbedder();

  // Embed the section heading as the query vector
  const queryEmbedding = await embedderInstance.embedQuery(sectionHeading);

  const results = await index.namespace(projectId).query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  // Return clean array of chunks with scores
  return results.matches.map((match) => ({
    textChunk:   match.metadata.text_chunk,
    sourceUrl:   match.metadata.source_url,
    score:       match.score,           // Cosine similarity: 1.0 = identical
    keywordTags: match.metadata.keyword_tags?.split(',') || [],
  }));
}

// ── Query Research for Fact Verification ──────────────────
// Called by factCheckValidator (Node 15)
// For each claim, finds the most similar research chunk and 
// returns both the best match and its similarity score.
// Low score = claim is likely hallucinated (not in research DB)
//
// claims: string[] — Factual claims extracted from drafted text
// projectId: string
export async function verifyClaimsAgainstResearch(claims, projectId) {
  const index = getPineconeIndex();
  const embedderInstance = getEmbedder();

  const verificationResults = [];

  for (const claim of claims) {
    const queryEmbedding = await embedderInstance.embedQuery(claim);

    const results = await index.namespace(projectId).query({
      vector: queryEmbedding,
      topK: 3,
      includeMetadata: true,
    });

    const bestMatch = results.matches[0];

    // Threshold: score < 0.70 = claim not well-supported by research
    const HALLUCINATION_THRESHOLD = 0.70;
    const isVerified = bestMatch && bestMatch.score >= HALLUCINATION_THRESHOLD;

    verificationResults.push({
      claim,
      isVerified,
      similarityScore:  bestMatch?.score || 0,
      closestEvidence:  bestMatch?.metadata?.text_chunk || null,
      evidenceSource:   bestMatch?.metadata?.source_url || null,
    });
  }

  return verificationResults;
}

// ── Delete Project Namespace ───────────────────────────────
// Called during project cleanup or restart
export async function deleteProjectVectors(projectId) {
  const index = getPineconeIndex();
  try {
    await index.namespace(projectId).deleteAll();
    console.log(`[Pinecone] Deleted all vectors for project: ${projectId}`);
    return { deleted: true };
  } catch (err) {
    console.error(`[Pinecone] Delete failed for project ${projectId}:`, err.message);
    return { deleted: false, error: err.message };
  }
}
