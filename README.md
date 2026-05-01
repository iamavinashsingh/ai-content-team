# AI Content Team — V2.0.0 [ Currently Working On]

Autonomous multi-agent content production system built with LangGraph, Node.js, OpenAI, Pinecone, and Neon PostgreSQL.

## Architecture

```
User Brief → PM Strategist → Research (Tavily + Firecrawl + Pinecone)
  → Architect Outline → Blueprint Validator → Planner
    → [Parallel] Writer × N sections
      → Editor → Fact Check Validator → DALL-E 3 Media → Snapshot
    → Document Assembler → User Review → CMS Publisher
```

### 28-Node LangGraph Pipeline

| Phase | Nodes | Description |
|-------|-------|-------------|
| 1 — Strategy | 1–2 | PM Strategist, Human Input |
| 2 — Research | 3–4 | Search queries, web scraping, Pinecone embedding |
| 3 — Architecture | 5–6 | Outline design, SEO blueprint validation |
| 4 — Planning | 7–9 | Task queue, dependency ordering, workspace setup |
| 5 — Writing Engine | 10–21 | RAG context, parallel drafting, editing, fact-checking, media |
| 6 — Publishing | 22–27 | Assembly, review, CMS publish |

### V2 Anti-Hallucination & Quality Fixes

| Fix | Node | What it prevents |
|-----|------|-----------------|
| Fact Check Validator | 15 | Invented statistics and quotes |
| Brand Voice Extractor | 19 | Tone drift across sections |
| Snapshot Manager | 17 | Lost drafts on crash |
| Blueprint Validator | 6 | Outline/brief misalignment |
| State Compactor | 20 | Context window overflow |
| Workspace Health Check | 9 | Wasted compute on bad API keys |

---

## Quick Start

### 1. Clone and install
```bash
git clone <repo>
cd ai-content-team
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your API keys:
# OPENAI_API_KEY, PINECONE_API_KEY, DATABASE_URL
```

### 3. Create Pinecone index
In your Pinecone dashboard, create an index named `ai-content-research`:
- **Dimensions**: 1536
- **Metric**: cosine
- **Environment**: match your `PINECONE_ENVIRONMENT`

### 4. Run database migration
```bash
npm run db:migrate
```

### 5. Test all connections
```bash
npm run test:connections
```

### 6. Start the server
```bash
npm run dev        # Development (auto-reload)
npm start          # Production
```

---

## API Reference

### Start a project
```http
POST /api/v1/project/init
Content-Type: application/json

{
  "brief": "Write a 2000-word blog post about the benefits of remote work for software engineers. Target audience: engineering managers. Tone: authoritative but friendly. CMS: wordpress.",
  "cmsTarget": "wordpress"
}
```

Response:
```json
{
  "projectId": "uuid",
  "streamUrl": "/api/v1/project/uuid/stream"
}
```

### Connect to live stream (SSE)
```javascript
const evtSource = new EventSource(`/api/v1/project/${projectId}/stream`);

evtSource.addEventListener('node_start',          (e) => console.log('Node started:', JSON.parse(e.data)));
evtSource.addEventListener('node_complete',        (e) => console.log('Node done:', JSON.parse(e.data)));
evtSource.addEventListener('token',               (e) => process.stdout.write(JSON.parse(e.data).text));
evtSource.addEventListener('clarifying_questions',(e) => showQuestions(JSON.parse(e.data)));
evtSource.addEventListener('article_ready',       (e) => showArticle(JSON.parse(e.data)));
evtSource.addEventListener('budget_update',       (e) => updateCostBadge(JSON.parse(e.data)));
evtSource.addEventListener('published',           (e) => openUrl(JSON.parse(e.data).url));
evtSource.addEventListener('escalated',           (e) => showError(JSON.parse(e.data)));
```

### Submit clarifying answers
```http
POST /api/v1/project/:id/feedback
Content-Type: application/json

{
  "type": "clarification",
  "payload": "Target audience is mid-level engineering managers at startups. Tone should be data-driven. Length 1800 words."
}
```

### Submit article review
```http
POST /api/v1/project/:id/feedback
Content-Type: application/json

{
  "type": "review",
  "payload": {
    "satisfied": false,
    "typos": ["section_2: 'it's' should be 'its' in paragraph 3"],
    "rewrites": ["section_3: Make the statistics section shorter, cut to 3 key stats only"],
    "newSections": ["Add a section on async communication tools"],
    "comments": "Overall great, just needs the above tweaks."
  }
}
```

Approve and publish:
```http
POST /api/v1/project/:id/feedback
{
  "type": "review",
  "payload": { "satisfied": true }
}
```

### List snapshots (for rollback)
```http
GET /api/v1/project/:id/snapshots
```

### Rollback to version
```http
POST /api/v1/project/:id/rollback/3
```

---

## Token Budget

Default: **50,000 tokens per project** (~$0.50–1.50 per article depending on length).

| Model | Used by | Cost |
|-------|---------|------|
| GPT-4o | Writer, Editor, Architect, PM | $2.50/$10.00 per 1M |
| GPT-4o-mini | Router, Planner, Fact Extractor | $0.15/$0.60 per 1M |
| DALL-E 3 | Media Agent | $0.04 per image |
| text-embedding-3-small | Research embedding | $0.02 per 1M |

Adjust limits in `.env`:
```
MAX_TOKENS_PER_PROJECT=80000
WARN_TOKENS_THRESHOLD=60000
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Orchestration | LangGraph.js |
| LLM | OpenAI GPT-4o / GPT-4o-mini |
| Image Gen | OpenAI DALL-E 3 |
| Vector DB | Pinecone |
| Relational DB | Neon PostgreSQL |
| Media Storage | AWS S3 |
| Search | Tavily API |
| Scraping | Firecrawl API |
| Backend | Node.js + Express |
| Streaming | Server-Sent Events (SSE) |

---

## Project Structure

```
src/
├── agents/          # All 27 node implementations
│   ├── pmStrategist.js
│   ├── researchStep1.js
│   ├── writerAgent.js
│   ├── factCheckValidator.js  ⭐ Anti-hallucination
│   ├── brandVoiceExtractor.js ⭐ Voice consistency
│   ├── snapshotManager.js     ⭐ Rollback
│   └── ... (27 total)
├── api/
│   └── routes.js    # REST endpoints + SSE streaming
├── config/
│   └── index.js     # Model routing, token budgets, env
├── database/
│   └── index.js     # Neon PostgreSQL client + schema
├── graph/
│   └── graphBuilder.js  # 28-node graph with all edges
├── state/
│   └── graphState.js    # Master state annotation
├── utils/
│   └── tokenTracker.js  # Budget enforcement + cost calc
└── vector/
    └── index.js     # Pinecone client + RAG helpers
scripts/
├── migrate.js       # npm run db:migrate
└── testConnections.js  # npm run test:connections
```
