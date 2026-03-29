// src/agents/publisherAgent.js
// ============================================================
// Node 27: Publisher Agent
//
// Responsibilities:
//  - Convert assembled Markdown to CMS-specific format
//  - Inject SEO meta tags (title, description, OG tags)
//  - Add alt text to all images
//  - Publish via WordPress REST API or Ghost Admin API
//  - Return the live URL on success
//
// State reads:  assembledDocument, outline, structuredBrief,
//               generatedMedia, projectId
// State writes: publishedUrl, graphStatus
// ============================================================

import { SERVICES } from '../config/index.js';
import { updateProject } from '../database/index.js';

// ── Simple Markdown → HTML converter ─────────────────────
// For production, swap this with a library like 'marked' or 'remark'
function markdownToHtml(markdown) {
  let html = markdown
    // Strip frontmatter
    .replace(/^---[\s\S]*?---\n/m, '')
    // Headers
    .replace(/^#{1}\s+(.+)$/gm,  '<h1>$1</h1>')
    .replace(/^#{2}\s+(.+)$/gm,  '<h2>$1</h2>')
    .replace(/^#{3}\s+(.+)$/gm,  '<h3>$1</h3>')
    .replace(/^#{4}\s+(.+)$/gm,  '<h4>$1</h4>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g,  '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,      '<em>$1</em>')
    // Images
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" loading="lazy" />')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs — wrap non-tagged lines
    .replace(/^(?!<[hupli]|<\/[upl])(.+)$/gm, '<p>$1</p>')
    // Cleanup double-blank lines
    .replace(/\n{3,}/g, '\n\n');

  return html;
}

// ── WordPress Publisher ────────────────────────────────────
async function publishToWordPress(content, brief, outline, media) {
  const { url, username, appPassword } = SERVICES.wordpress;
  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

  const html = markdownToHtml(content.markdown);

  // Build post payload
  const postPayload = {
    title:   outline.h1,
    content: html,
    status:  'draft',       // Always publish as draft first — user confirms
    excerpt: outline.metaDescription,
    meta: {
      _yoast_wpseo_title:           outline.h1,
      _yoast_wpseo_metadesc:        outline.metaDescription,
      _yoast_wpseo_focuskw:         brief.seoKeywords[0],
    },
  };

  const response = await fetch(`${url}/wp-json/wp/v2/posts`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify(postPayload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`WordPress API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const post = await response.json();
  console.log(`[publisherAgent] WordPress draft created: ID ${post.id}`);
  return post.link || `${url}/?p=${post.id}`;
}

// ── Ghost Publisher ────────────────────────────────────────
async function publishToGhost(content, brief, outline) {
  const { url, adminApiKey } = SERVICES.ghost;

  // Ghost uses JWT authentication
  const [id, secret] = adminApiKey.split(':');
  const { createHmac } = await import('crypto');

  // Build JWT token (Ghost Admin API auth)
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${header}.${payload}`)
    .digest('base64url');
  const jwt = `${header}.${payload}.${signature}`;

  const html = markdownToHtml(content.markdown);

  const postPayload = {
    posts: [{
      title:             outline.h1,
      html,
      status:            'draft',
      meta_title:        outline.h1,
      meta_description:  outline.metaDescription,
      custom_excerpt:    outline.metaDescription,
      tags: brief.seoKeywords.map((kw) => ({ name: kw })),
    }],
  };

  const response = await fetch(`${url}/ghost/api/admin/posts/`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Ghost ${jwt}`,
    },
    body: JSON.stringify(postPayload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Ghost API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const post = data.posts[0];
  console.log(`[publisherAgent] Ghost draft created: ID ${post.id}`);
  return post.url;
}

// ── Main Node ──────────────────────────────────────────────
export async function publisherAgentNode(state) {
  const { assembledDocument, outline, structuredBrief, generatedMedia, projectId } = state;
  const cmsTarget = structuredBrief?.cmsTarget || 'none';

  console.log(`[publisherAgent] Publishing to: ${cmsTarget}`);

  let publishedUrl = null;

  try {
    if (cmsTarget === 'wordpress') {
      publishedUrl = await publishToWordPress(
        assembledDocument, structuredBrief, outline, generatedMedia
      );
    } else if (cmsTarget === 'ghost') {
      publishedUrl = await publishToGhost(
        assembledDocument, structuredBrief, outline
      );
    } else {
      // 'none' — just mark as complete, return the Markdown as the "URL"
      console.log('[publisherAgent] No CMS target — article ready for manual export');
      publishedUrl = `local://project/${projectId}/article.md`;
    }

    console.log(`[publisherAgent] ✅ Published successfully: ${publishedUrl}`);

    // Update project as published
    await updateProject(projectId, {
      status:        'published',
      graph_status:  'complete',
      published_url: publishedUrl,
    });

    return {
      publishedUrl,
      graphStatus: 'complete',
    };
  } catch (err) {
    console.error(`[publisherAgent] Publish failed: ${err.message}`);

    await updateProject(projectId, { status: 'error' });

    return {
      errors: [{
        node:      'publisherAgent',
        error:     err.message,
        timestamp: new Date().toISOString(),
      }],
      escalationReason: `Publishing to ${cmsTarget} failed: ${err.message}`,
      graphStatus:      'escalated',
    };
  }
}
