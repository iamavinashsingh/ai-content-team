# AI Content Team — Frontend Integration Specification

This document outlines the architecture, data flows, and API endpoints required to build a responsive frontend for the **AI Content Team** background pipeline.

The backend uses a Node.js/Express server to run a 28-node AI pipeline built with LangGraph. It communicates asynchronously with the frontend via HTTP REST endpoints and Server-Sent Events (SSE).

---

## High-Level User Journey

1. **Initialization**: The user submits a content brief paragraph via the frontend.
2. **Monitoring**: The frontend connects to an SSE stream and displays a live "console" or progress tracker of the agentic nodes executing. It can also show live streaming LLM text during generation.
3. **Interrupt 1 (Clarifying Questions)**: The AI realizes it needs more info. The graph **pauses**, and the SSE stream sends an `interrupt` event. The UI displays the questions, collects answers, and submits them to resume the graph.
4. **Interrupt 2 (Review Phase)**: The AI finishes assembling the draft. The graph **pauses** again. The SSE stream sends an `article_ready` event (with the full Markdown) followed by an `interrupt` event. The UI allows the user to read the draft, approve it, or request structured revisions.
5. **Completion**: If approved, the pipeline finishes and returning a published URL.

---

## 1. REST Endpoints

The backend runs on `http://localhost:3001` (by default). All endpoints are prefixed with `/api/v1`.

### 1.1 Start a Project
`POST /api/v1/project/init`

Kicks off a new AI content creation project.

**Request Payload:**
```json
{
  "brief": "I need a 1500-word blog post about the benefits of Server-Sent events vs WebSockets...",
  "cmsTarget": "none",       // Options: "none", "wordpress", "ghost"
  "workspaceId": "uuid-here" // Optional
}
```

**Response (201 Created):**
```json
{
  "projectId": "123e4567-e89b-12d3...",
  "threadId": "langgraph-thread-id...",
  "status": "started",
  "streamUrl": "/api/v1/project/123e4567-e89b-12d3.../stream",
  "message": "Connect to streamUrl to receive real-time updates"
}
```

### 1.2 Submit Human Feedback (Resume Graph)
`POST /api/v1/project/:projectId/feedback`

Used to resume the graph when it is paused by an `interrupt` event.

**Scenario A: Answering Clarifying Questions**
```json
{
  "type": "clarification",
  "payload": "Here are my answers: 1. Target audience is juniors. 2. Tone should be casual."
}
```

**Scenario B: Submitting an Article Review**
```json
{
  "type": "review",
  "payload": {
    "satisfied": false,          // true configures approval, false requests changes
    "typos": ["intro: fix spelling of APIs"],
    "rewrites": ["conclusion: make it punchier"],
    "newSections": ["Add a section comparing to Long Polling"],
    "comments": "Great draft, just a few tweaks."
  }
}
```

### 1.3 Project Data & Versioning
- **`GET /api/v1/project/:id`**: Get raw project data from DB.
- **`GET /api/v1/project/:id/snapshots`**: Returns all saved document versions (`{ snapshots: [...] }`)
- **`POST /api/v1/project/:id/rollback/:version`**: Restores the graph to a previous snapshot version. Returns the restored `draftedSections`.

---

## 2. Server-Sent Events (SSE) Stream

`GET /api/v1/project/:projectId/stream`

This is the most critical part of the frontend. Once a project is initialized, the frontend should immediately connect an `EventSource` to this URL to receive live updates.

### Event Dictionary

| Event Name | Data Payload | Frontend UI Action |
| --- | --- | --- |
| `status` | `{ message, node, timestamp }` | Display in a live progress feed or toasts. |
| `node_start` | `{ node, timestamp }` | Update a visual pipeline/graph component to show the active agent. |
| `node_complete` | `{ node, outputKeys, timestamp }` | Mark agent as complete in the UI. |
| `token` | `{ text }` | Used for "typewriter" effect. Append `text` to a streaming text box. |
| `budget_update` | `{ totalTokensUsed, estimatedCostUsd }` | Update a live $ cost / token counter UI. |
| `published` | `{ url }` | Show success screen with the live link! |
| `escalated` | `{ reason }` | Show a heavy warning/error state requiring manual intervention. |
| `error` | `{ message }` | Display toast/alert for system crashes. |

### Complex Events requiring UI Modals:

#### The `interrupt` Event
Fired when the AI pauses and waits for user input.
```json
// Example 1: PM Clarifying Questions
{
  "type": "clarifying_questions",
  "message": "Please answer the following...",
  "questions": [
    { "index": 1, "id": "q1", "question": "Who is the audience?", "reason": "Missing from brief" }
  ]
}

// Example 2: Editor Feedback
{
  "type": "review_article",
  "message": "Please review the article and submit your feedback.",
  "article": { "title": "...", "wordCount": 1500 }
}
```
**Handling**: When received, open a modal with a form. When the user submits the form, send the data via the `POST /feedback` endpoint (see section 1.2).

#### The `article_ready` Event
Fires exactly once, right before the `review_article` interrupt. It contains the fully generated Markdown text.
```json
{
  "type": "article_ready",
  "article": {
    "title": "My Great Article",
    "markdown": "# My Great Article\n\n...",
    "wordCount": 1200,
    "readingTime": 5,
    "sectionCount": 4,
    "mediaCount": 2,
    "assembledAt": "2023-..."
  },
  "brief": { /* original brief data */ },
  "cost": { "totalCostUsd": 0.15, "percentOfBudget": 12 },
  "snapshots": [ /* previous versions */ ]
}
```
**Handling**: Render the `article.markdown` using a Markdown parser (e.g., `react-markdown`). Present this alongside the feedback form.

---

## Implementation Tips for the Frontend Dev

1. **State Management**: Because the workflow is highly async and streaming, keeping track of the current "status" (e.g. `initializing` -> `running` -> `awaiting_clarification` -> `running` -> `awaiting_review` -> `published`) is crucial. Use the SSE stream to drive this state machine.
2. **Reconnection**: The backend sends a periodic `: heartbeat` to keep the SSE connection alive. If the SSE drops, your `EventSource` should automatically attempt to reconnect.
3. **Markdown Rendering**: Note that the final article contains `<img>` tags representing generated DALL-E images. Ensure your markdown renderer allows these.
4. **CORS**: If running on different ports (e.g., React on 3000, Node on 3001), ensure the backend `APP_CONFIG` has CORS enabled for your local frontend port.
