// src/agents/documentAssembler.js
// ============================================================
// Node 22: Document Assembler
//
// Responsibilities:
//  - Stitch all completed section drafts in outline order
//  - Inject media (S3 image URLs) at the correct positions
//  - Add proper Markdown headings (## / ###)
//  - Prepend SEO meta block (title, description, keywords)
//  - Calculate final word count and readability stats
//  - Produce a single cohesive Markdown document
//
// State reads:  draftedSections, generatedMedia, outline,
//               structuredBrief, taskQueue
// State writes: assembledDocument
// ============================================================

import { updateProject } from '../database/index.js';

// Build a Markdown image embed with alt text
function markdownImage(mediaEntry) {
  if (!mediaEntry?.s3Url) return '';
  const alt = mediaEntry.altText || 'Article illustration';
  return `\n![${alt}](${mediaEntry.s3Url})\n`;
}

// Calculate reading time (avg 238 words/min)
function readingTimeMinutes(wordCount) {
  return Math.max(1, Math.round(wordCount / 238));
}

export async function documentAssemblerNode(state) {
  const { draftedSections, generatedMedia, outline, structuredBrief, taskQueue } = state;

  console.log('[documentAssembler] Assembling final document...');

  // ── Order sections by outline ──────────────────────────
  // We use outline.sections as the canonical order,
  // then pull text from draftedSections by section ID.
  // Split tasks create new sectionIds with _split_ suffix —
  // we handle those by finding them in the taskQueue.
  const orderedSections = [];

  for (const outlineSection of outline.sections) {
    const sectionId = outlineSection.id;

    // Check if this section was split
    const originalTask = taskQueue?.find((t) => t.sectionId === sectionId);
    if (originalTask?.status === 'split') {
      // Find replacement split tasks in order
      const splitTasks = (taskQueue || [])
        .filter((t) => t.splitFrom === sectionId)
        .sort((a, b) => a.sectionId.localeCompare(b.sectionId));

      for (const splitTask of splitTasks) {
        const splitDraft = draftedSections?.[splitTask.sectionId];
        if (splitDraft?.rawText) {
          orderedSections.push({
            sectionId:  splitTask.sectionId,
            heading:    splitTask.heading,
            level:      splitTask.level || 3,
            text:       splitDraft.rawText,
            requiresMedia: splitTask.requiresMedia,
          });
        }
      }
      continue;
    }

    // Normal section
    const drafted = draftedSections?.[sectionId];
    if (drafted?.rawText) {
      orderedSections.push({
        sectionId,
        heading:      outlineSection.heading,
        level:        outlineSection.level,
        text:         drafted.rawText,
        requiresMedia:outlineSection.requiresMedia,
      });
    } else {
      console.warn(`[documentAssembler] Missing text for section: ${sectionId} — skipping`);
    }
  }

  console.log(`[documentAssembler] Assembling ${orderedSections.length} sections`);

  // ── Build Markdown document ────────────────────────────
  const parts = [];

  // SEO frontmatter block (useful for most CMS systems)
  parts.push(`---`);
  parts.push(`title: "${outline.h1}"`);
  parts.push(`description: "${outline.metaDescription || ''}"`);
  parts.push(`keywords: ${structuredBrief.seoKeywords.join(', ')}`);
  parts.push(`author: AI Content Team`);
  parts.push(`date: ${new Date().toISOString().split('T')[0]}`);
  parts.push(`---\n`);

  // H1 Title
  parts.push(`# ${outline.h1}\n`);

  // Hero image (from section_1 if available)
  const heroMedia = generatedMedia?.[orderedSections[0]?.sectionId];
  if (heroMedia?.s3Url) {
    parts.push(markdownImage(heroMedia));
  }

  // Sections
  for (const section of orderedSections) {
    const headingPrefix = '#'.repeat(section.level);

    // Add heading
    parts.push(`\n${headingPrefix} ${section.heading}\n`);

    // Add section body text
    parts.push(section.text);

    // Add media AFTER section text (except hero already added above)
    const media = generatedMedia?.[section.sectionId];
    if (media?.s3Url && section.sectionId !== orderedSections[0]?.sectionId) {
      parts.push(markdownImage(media));
    }
  }

  const assembledMarkdown = parts.join('\n');

  // ── Compute stats ──────────────────────────────────────
  // Strip frontmatter and headings for accurate word count
  const bodyText   = assembledMarkdown.replace(/^---[\s\S]*?---\n/m, '').replace(/^#+\s.+$/gm, '');
  const wordCount  = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const charCount  = bodyText.length;
  const readingTime= readingTimeMinutes(wordCount);
  const mediaCount = Object.keys(generatedMedia || {}).length;

  console.log(`[documentAssembler] ✅ Document assembled:`);
  console.log(`  Sections:     ${orderedSections.length}`);
  console.log(`  Words:        ${wordCount.toLocaleString()}`);
  console.log(`  Characters:   ${charCount.toLocaleString()}`);
  console.log(`  Reading time: ~${readingTime} min`);
  console.log(`  Images:       ${mediaCount}`);

  // Persist assembled content to DB
  await updateProject(state.projectId, { status: 'review' });

  return {
    assembledDocument: {
      markdown:    assembledMarkdown,
      wordCount,
      charCount,
      readingTime,
      sectionCount: orderedSections.length,
      mediaCount,
      assembledAt: new Date().toISOString(),
    },
  };
}
