// scripts/testConnections.js
// Run with: npm run test:connections
// Pings all 4 external services and reports status

import 'dotenv/config';
import { validateEnv } from '../src/config/index.js';
import { checkDbHealth, closePool } from '../src/database/index.js';
import { checkPineconeHealth } from '../src/vector/index.js';

async function testConnections() {
  console.log('\n🔍 AI Content Team — Connection Test\n' + '─'.repeat(40));

  try {
    validateEnv();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const results = {};

  // 1. PostgreSQL (Neon)
  process.stdout.write('  PostgreSQL (Neon) ... ');
  const dbResult = await checkDbHealth();
  results.postgres = dbResult.healthy;
  console.log(dbResult.healthy
    ? `✅ Connected (server time: ${new Date(dbResult.serverTime).toLocaleTimeString()})`
    : `❌ FAILED: ${dbResult.error}`
  );

  // 2. Pinecone
  process.stdout.write('  Pinecone          ... ');
  const pineconeResult = await checkPineconeHealth();
  results.pinecone = pineconeResult.healthy;
  console.log(pineconeResult.healthy
    ? `✅ Connected (index: ${pineconeResult.indexName})`
    : `❌ FAILED: ${pineconeResult.error}`
  );

  // 3. OpenAI
  process.stdout.write('  OpenAI API        ... ');
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    results.openai = response.ok;
    console.log(response.ok ? '✅ Connected' : `❌ FAILED: HTTP ${response.status}`);
  } catch (err) {
    results.openai = false;
    console.log(`❌ FAILED: ${err.message}`);
  }

  // 4. Tavily (optional)
  if (process.env.TAVILY_API_KEY) {
    process.stdout.write('  Tavily Search     ... ');
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: 'test', max_results: 1 }),
      });
      results.tavily = response.ok;
      console.log(response.ok ? '✅ Connected' : `❌ FAILED: HTTP ${response.status}`);
    } catch (err) {
      results.tavily = false;
      console.log(`❌ FAILED: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(40));
  const allPass = Object.values(results).every(Boolean);
  if (allPass) {
    console.log('✅ All connections healthy. Ready to run!\n');
  } else {
    const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
    console.log(`❌ ${failed.length} connection(s) failed: ${failed.join(', ')}`);
    console.log('   Check your .env file and try again.\n');
    process.exit(1);
  }

  await closePool();
}

testConnections();
