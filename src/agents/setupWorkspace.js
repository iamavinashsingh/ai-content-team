// src/agents/setupWorkspace.js
// ============================================================
// Node 8: Setup Workspace
//
// Responsibilities:
//  - Initialize the draft document record in PostgreSQL
//  - Create the project's media folder in S3
//  - Store credentials reference for the project
//  - Prepare any project-specific configuration
//
// State reads:  projectId, workspaceId, structuredBrief, outline
// State writes: (side effects only — no state mutations needed)
// ============================================================

import { SERVICES } from '../config/index.js';
import { updateProject } from '../database/index.js';

// ── S3 folder creation ─────────────────────────────────────
// Creates a "folder" prefix in S3 by putting a placeholder object
// Real images will be stored at: {bucket}/{projectId}/images/{filename}
async function createS3Folder(projectId) {
  if (!SERVICES.s3.accessKeyId || !SERVICES.s3.bucket) {
    console.warn('[setupWorkspace] S3 credentials not configured — skipping media folder creation');
    return { created: false, reason: 'S3 not configured' };
  }

  try {
    // Dynamic import to avoid errors if AWS SDK is not installed
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3').catch(() => {
      throw new Error('Install @aws-sdk/client-s3 to enable S3 media storage');
    });

    const s3 = new S3Client({
      region:      SERVICES.s3.region,
      credentials: {
        accessKeyId:     SERVICES.s3.accessKeyId,
        secretAccessKey: SERVICES.s3.secretAccessKey,
      },
    });

    // S3 "folders" are just key prefixes — put a tiny placeholder
    await s3.send(new PutObjectCommand({
      Bucket: SERVICES.s3.bucket,
      Key:    `${projectId}/.project`,
      Body:   Buffer.from(JSON.stringify({ projectId, createdAt: new Date().toISOString() })),
      ContentType: 'application/json',
    }));

    const folderUrl = `https://${SERVICES.s3.bucket}.s3.${SERVICES.s3.region}.amazonaws.com/${projectId}/`;
    console.log(`[setupWorkspace] S3 folder created: ${folderUrl}`);
    return { created: true, folderUrl };
  } catch (err) {
    console.warn(`[setupWorkspace] S3 setup failed (non-fatal): ${err.message}`);
    return { created: false, reason: err.message };
  }
}

export async function setupWorkspaceNode(state) {
  const { projectId, structuredBrief, outline } = state;
  console.log(`[setupWorkspace] Initializing workspace for project: ${projectId}`);

  // 1. Update project with CMS target from brief
  await updateProject(projectId, {
    title:      outline?.h1 || structuredBrief?.title || 'Untitled',
    status:     'writing',
  });
  console.log('[setupWorkspace] ✓ Project record updated in PostgreSQL');

  // 2. Create S3 media folder
  const s3Result = await createS3Folder(projectId);
  if (s3Result.created) {
    console.log('[setupWorkspace] ✓ S3 media folder ready');
  }

  // 3. Log workspace initialization summary
  console.log('[setupWorkspace] Workspace ready:');
  console.log(`  Project ID:   ${projectId}`);
  console.log(`  Article:      ${outline?.h1 || structuredBrief?.title}`);
  console.log(`  Sections:     ${outline?.sections?.length || 0}`);
  console.log(`  CMS Target:   ${structuredBrief?.cmsTarget || 'none'}`);
  console.log(`  S3 Media:     ${s3Result.created ? 'enabled' : 'disabled'}`);

  // setupWorkspace has no state mutations — it's a side-effect node
  // The next node (workspaceHealthCheck) reads the same state
  return {};
}
