// src/agents/researchStep2.js
// ============================================================
// Node 4: Research Step 2 — Web Scraper + Vector Embedder
//
// Responsibilities:
//  - Execute Tavily searches for each query from researchStep1
//  - Scrape full article text via Firecrawl (bypasses paywalls)
//  - Chunk the text into paragraphs
//  - Embed and store everything in Pinecone (namespaced by projectId)
//
// State reads:  searchQueries, structuredBrief, projectId
// State writes: scrapedSources, researchComplete
//
// Design doc: "Scrapes top 3 articles per query, extracts core
//              facts, statistics, and quotes. Embeds and stores
//              in Pinecone Vector DB."
// ============================================================

import { SERVICES } from '../config/index.js';
import { upsertResearchChunks } from '../vector/index.js';
import { updateProject } from '../database/index.js';

// ── Tavily Search ──────────────────────────────────────────
async function searchTavily(query) {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:      SERVICES.tavily.apiKey,
        query,
        max_results:  5,
        search_depth: 'advanced',
        include_raw_content: false,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.warn(`[researchStep2] Tavily search failed for "${query}": ${err.message}`);
    return [];
  }
}

// ── Firecrawl Scrape ───────────────────────────────────────
async function scrapeUrl(url) {
  if (!SERVICES.firecrawl.apiKey) {
    // Fallback: use Tavily's snippet if Firecrawl key not set
    return null;
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICES.firecrawl.apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 15000,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.data?.markdown || null;
  } catch (err) {
    console.warn(`[researchStep2] Firecrawl failed for ${url}: ${err.message}`);
    return null;
  }
}

// ── Text Chunker ───────────────────────────────────────────
// Split article text into overlapping paragraph-sized chunks
// Optimal chunk size for semantic search: ~200-400 words
function chunkText(text, sourceUrl, keywordTags) {
  if (!text || text.trim().length < 50) return [];

  // Split on double newlines (paragraph breaks) or every ~300 words
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 80);  // Skip very short fragments

  const chunks = [];
  for (const para of paragraphs) {
    // If paragraph is too long, split further by sentence
    if (para.split(' ').length > 350) {
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      let currentChunk = '';
      for (const sentence of sentences) {
        if ((currentChunk + sentence).split(' ').length > 300) {
          if (currentChunk.trim()) {
            chunks.push({ text_chunk: currentChunk.trim(), source_url: sourceUrl, keyword_tags: keywordTags });
          }
          currentChunk = sentence;
        } else {
          currentChunk += ' ' + sentence;
        }
      }
      if (currentChunk.trim()) {
        chunks.push({ text_chunk: currentChunk.trim(), source_url: sourceUrl, keyword_tags: keywordTags });
      }
    } else {
      chunks.push({ text_chunk: para, source_url: sourceUrl, keyword_tags: keywordTags });
    }
  }

  return chunks;
}

// ── Main Node ──────────────────────────────────────────────
export async function researchStep2Node(state) {
  const { searchQueries, structuredBrief, projectId } = state;
  console.log(`[researchStep2] Executing ${searchQueries.length} searches...`);

  const allSources  = [];
  const allChunks   = [];
  const seenUrls    = new Set();

  // Process queries sequentially to avoid rate limits
  for (let i = 0; i < searchQueries.length; i++) {
    const query = searchQueries[i];
    console.log(`[researchStep2] Search ${i + 1}/${searchQueries.length}: "${query}"`);

    const results = await searchTavily(query);

    // Take top 3 results per query (design doc spec)
    const topResults = results.slice(0, 3);

    for (const result of topResults) {
      if (seenUrls.has(result.url)) continue;  // Deduplicate
      seenUrls.add(result.url);

      let articleText = result.content || result.raw_content || '';

      // Try to get full text via Firecrawl
      const scraped = await scrapeUrl(result.url);
      if (scraped) {
        articleText = scraped;
        console.log(`[researchStep2]   ✓ Scraped full text: ${result.url}`);
      } else {
        console.log(`[researchStep2]   ~ Using snippet: ${result.url}`);
      }

      const source = {
        url:       result.url,
        title:     result.title || 'Unknown',
        summary:   result.content?.slice(0, 300) || '',
        scrapedAt: new Date().toISOString(),
      };
      allSources.push(source);

      // Chunk this article's text for embedding
      const chunks = chunkText(
        articleText,
        result.url,
        structuredBrief.seoKeywords
      );
      allChunks.push(...chunks);
    }

    // Brief pause between queries to respect rate limits
    if (i < searchQueries.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`[researchStep2] Collected ${allSources.length} sources, ${allChunks.length} text chunks`);

  // ── Embed and store in Pinecone ────────────────────────
  if (allChunks.length > 0) {
    console.log(`[researchStep2] Embedding ${allChunks.length} chunks into Pinecone...`);
    const { upserted } = await upsertResearchChunks(allChunks, projectId);
    console.log(`[researchStep2] ✅ ${upserted} vectors stored in Pinecone namespace: ${projectId}`);
  } else {
    console.warn('[researchStep2] No chunks to embed — research may be limited');
  }

  // Update project status
  await updateProject(projectId, { status: 'outlining' });

  return {
    scrapedSources:   allSources,
    researchComplete: true,
  };
}
