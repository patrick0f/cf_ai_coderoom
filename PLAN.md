# CodeRoom - Detailed Project Plan

This document contains the full implementation plan and architecture details for the CodeRoom project.

## Project Overview

Cloudflare is basically asking: "Can you build a real AI-powered app on Cloudflare that demonstrates you understand full-stack + distributed systems primitives?"

They're explicitly looking for evidence that you can:
- Integrate an LLM
- Design coordination / multi-step processing
- Build a real UI (chat or voice)
- Manage memory/state properly (not just a stateless demo)
- Document it so a reviewer can try it quickly

## Requirements (mapped to what we'll build)

### LLM
- **Plan**: Workers AI with a model like Llama
- **Deliverable**: Assistant can answer questions about pasted code, propose changes, generate tests, etc.

### Workflow / Coordination
- **Plan**: Cloudflare Workflows (or DO orchestration) to run background tasks:
  - Rolling summary ("memory distillation")
  - Optional deeper "review pass" on demand
  - TODO extraction
- **Deliverable**: Demonstrate at least one non-trivial multi-step pipeline

### User Input via Chat or Voice
- **Plan**: Cloudflare Pages for UI + chat input
- **Optional**: Add Realtime for streaming/presence later

### Memory or State
- **Plan**: Durable Object per room to store canonical state:
  - Messages (bounded)
  - Rolling summary
  - Pinned preferences
  - Artifacts (last review report, TODOs)

### Repo Constraints
- Repo name must start with `cf_ai_`
- Must include README.md with clear run instructions (local + deployed link)
- Must include PROMPTS.md with AI prompts used
- Must be original work

---

## Core Value Proposition

A web app where you can create a room, paste code, ask questions, and get:
- Streaming-ish assistant responses
- A persistent room memory that influences future answers
- A background review/summarization pipeline that updates artifacts in the UI

---

## Tech Stack (Cloudflare-native)

### Frontend
- Cloudflare Pages hosting a React/Vite UI
- Chat UI + "code paste" panel + artifacts panel (Summary / TODOs / Review)

### Backend
- Cloudflare Worker as API + LLM gateway
- Workers AI for model inference

### State
- Durable Objects (DO) as the authoritative state per room

### Coordination
- Cloudflare Workflows for background multi-step processing

### Optional "Wow" Layer
- Cloudflare Realtime for presence, live updates, token streaming

---

## Scope Definition

### In Scope (MVP)
- Single-user rooms (one browser session per room, enforced)
- Chat + code paste
- LLM responses
- Memory (rolling summary + last N messages)
- One workflow: "post-message processor" that updates summary + TODOs
- One workflow action: "deep review" button that generates review report

### Out of Scope (avoid time sink)
- Full code editor IDE
- Automatic patch application
- OAuth / user accounts
- Vector search / embeddings
- Complex multi-agent browsing/research

---

## Architecture (Single-User MVP)

### High-Level Flow
1. User loads `/{roomId}`
2. UI fetches room snapshot from DO
3. User sends message / code
4. Worker validates request and forwards to DO
5. DO appends message, updates state, returns canonical seq
6. Worker calls Workers AI to generate assistant response
7. DO stores assistant response + triggers Workflow for background processing
8. UI refreshes artifacts (poll or fetch after each send)

### ASCII Diagram
```
Pages (UI) → Worker API → Durable Object (RoomState) → Workers AI
                              ↓
                    triggers Workflows → updates DO artifacts
                              ↓
              UI reads snapshot/artifacts from DO (polling in MVP)
```

### Data Model (Durable Object)

```typescript
interface RoomState {
  roomId: string;
  createdAt: number;
  mode: "single_user" | "multi_user";
  ownerClientId: string;
  messages: Message[];  // bounded
  rollingSummary: string;
  pinnedPreferences: string;
  artifacts: {
    lastReview: { ts: number; content: string; inputHash: string } | null;
    todos: { ts: number; items: string[] } | null;
    notes: string;
  };
  limits: {
    maxMessages: number;
    maxCharsPerMessage: number;
  };
}

interface Message {
  seq: number;
  role: "user" | "assistant";
  content: string;
  ts: number;
  clientId?: string;
  metadata?: Record<string, unknown>;
}
```

---

## API Surface (Worker Routes)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/rooms` | Creates a new room, returns `{ roomId, joinUrl }` |
| GET | `/api/rooms/:roomId/snapshot` | Returns messages, rollingSummary, artifacts, preferences |
| POST | `/api/rooms/:roomId/message` | Send message, returns `{ seq, assistantMessage, artifacts? }` |
| POST | `/api/rooms/:roomId/review` | Forces deep review workflow, returns `{ accepted, jobId? }` |
| POST | `/api/rooms/:roomId/reset` | Clears messages/summary/artifacts |

**ClientId**: Generated on frontend, stored in localStorage.

---

## Prompting Strategy

### A) Runtime System Prompt (for the app)
- Sets role: pair programmer
- Forces structured output for review mode
- Enforces constraints: "Don't invent files; ask clarifying questions when needed; prefer minimal diffs."

### B) Development Prompts (recorded in PROMPTS.md)
- Log of prompts used to design, scaffold, debug, etc.

---

## MVP Roadmap

### Phase 0 — Repo + Compliance Setup (0.5 day)
**Goal**: Satisfy submission constraints early.

- [x] Create repo named `cf_ai_coderoom`
- [x] Add README.md skeleton
- [x] Add PROMPTS.md
- [x] Add .gitignore
- [x] Decide: TypeScript Worker + React frontend

**Acceptance**: Repo exists, named correctly, docs placeholders present.

### Phase 1 — Cloudflare Scaffolding (0.5–1 day)
**Goal**: Deployable "hello world" frontend + backend.

- [x] Create Pages frontend (Vite/React)
- [x] Create Worker API project
- [x] Wire Pages → Worker (via Pages Functions proxy)
- [x] Add health endpoint `GET /api/health`

**Acceptance**: Deployed Pages shows UI; Worker responds; README updated.

**Deployed:**
- Frontend: https://coderoom.pages.dev
- Worker: https://coderoom-worker.pfung5423.workers.dev

### Phase 2 — Durable Object RoomState (1 day)
**Goal**: Rooms + persistent state with bounded message log.

- [x] Implement DO RoomState
- [x] Implement `POST /api/rooms`
- [x] Implement `GET snapshot`
- [x] Implement `POST message`
- [x] Add single-user enforcement

**Acceptance**: Refresh page and history persists; second browser blocked.

**Completed:**
- RoomState DO with SQLite-backed storage
- Full test coverage (28 tests: 15 unit + 13 integration)
- Limits: maxMessages=30, maxCharsPerMessage=10000
- Owner enforcement via X-Client-Id header

### Phase 3 — LLM Integration (Workers AI) (1 day)
**Goal**: Responses generated with context.

- [x] Implement Workers AI call
- [x] Build context (system prompt + summary + messages + input)
- [x] Store assistant response in DO
- [x] Add guardrails (max input, timeouts, output cap)

**Acceptance**: Assistant responds consistently; memory included.

**Completed:**
- Workers AI with Llama 3.3 70B model
- Context builder with truncation (maxContextChars=6000)
- Output cap (maxOutputChars=5000)
- Atomic message pair storage (/messages-pair endpoint)
- Full test coverage (36 tests: 23 unit + 13 integration)

### Phase 4 — Memory Distillation Workflow (1–1.5 days)
**Goal**: Show "workflow/coordination" clearly.

- [x] Create Workflow: PostMessageProcessor
- [x] Steps: fetch snapshot → generate summary → extract TODOs → write back
- [x] Trigger workflow from Worker/DO
- [x] UI polls snapshot for updated artifacts

**Acceptance**: After messages, summary panel updates and influences answers.

**Completed:**
- Cloudflare Workflow with 4 durable steps
- Pure logic functions with 15 unit tests
- DO `/artifacts` endpoint for workflow to write back
- Fire-and-forget trigger via ctx.waitUntil
- Summary + TODO prompts documented in PROMPTS.md

### Phase 5 — "Deep Review" Mode (1 day)
**Goal**: Serious feature beyond just chat.

- [x] Add "Review" button in UI
- [x] `POST /api/rooms/:roomId/review` endpoint
- [x] Produce structured report (issues, edge cases, refactor, test plan)
- [x] Store and display `artifacts.lastReview`

**Acceptance**: Clicking Review produces structured report.

**Completed:**
- Synchronous review endpoint with input hash caching
- ReviewReport type with issues, edgeCases, refactorSuggestions, testPlan
- Pure logic functions: computeInputHash, buildReviewMessages, parseReviewResponse
- 18 unit tests for review-logic
- REVIEW_PROMPT documented in PROMPTS.md
- Frontend chat UI with message history and input
- Artifacts sidebar showing Summary, TODOs, and Review results
- "Run Review" button that calls review endpoint
- useRoom hook for API calls and client ID management
- Responsive layout with proper text wrapping

### Phase 6 — Polish + Demo Hardening (0.5–1 day)
**Goal**: Reduce flakiness; easy to evaluate.

- [x] Add "Reset room" button
- [x] Add "Copy room link" + "Copy last review"
- [x] Add basic rate limiting
- [x] Add logs for key events
- [x] Tighten README with "Try it in 2 minutes" section

**Acceptance**: Stranger can run locally or use deployed link without confusion.

**Completed:**
- Rate limiting via Durable Object (10 msg/min, 5 review/min per clientId)
- Structured JSON logging for room.created, message.sent, review.requested, room.reset, rate.limited
- Copy Link + Copy Review buttons with "Copied!" feedback
- Updated README "Try It" section with clear instructions

### Phase 7 — Realtime Token Streaming (SSE) (0.5–1.5 days)
**Goal**: Make assistant responses feel realtime by streaming output chunks to the UI, while keeping the Durable Object as the canonical persisted state.

- [x] Add `POST /api/rooms/:roomId/message/stream` endpoint with SSE
- [x] Implement SSE event protocol (meta, delta, done, error events)
- [x] Call Workers AI in streaming mode and forward deltas to client
- [x] Persist final assistant message to DO only on completion
- [x] Trigger PostMessageProcessor workflow after stream completes
- [x] Abort in-flight AI request on client disconnect
- [x] Frontend: render streaming "draft bubble" with incremental text
- [x] Frontend: add "Stop generating" button to abort stream
- [x] Frontend: handle mid-stream errors with partial content + retry
- [x] Add guardrails (maxOutputChars=5000) and log streaming metrics

**Acceptance**: Assistant response begins rendering within ~1s and streams continuously; refresh shows finalized message in DO; workflow runs only after completion.

**Completed:**
- SSE event types (meta, delta, done, error) with pure logic functions
- Streaming AI handler using Workers AI `stream: true` mode
- processAIStream generator with maxChars truncation
- Frontend Fetch-based SSE reader with draftContent state
- "Stop generating" button with AbortController
- Stream logging (stream.started, stream.completed, stream.error)
- 27 new unit tests (16 SSE logic + 11 streaming handler)

### Phase 8 — UI/UX Polishing (0.5–1 day)
**Goal**: Ensure the interface is smooth, visually polished, and functions well across devices.

- [x] Visual polish: consistent spacing, typography, transitions
- [x] Auto-scroll to latest message and focus management
- [x] Syntax highlighting for code blocks in messages

**Acceptance**: UI feels responsive and professional; works well on desktop; no jarring transitions or confusing states.

**Completed:**
- Syntax highlighting via highlight.js with 9 language support (JS, TS, Python, JSON, Bash, CSS, SQL, XML/HTML)
- Code block parser with TDD (10 unit tests)
- Auto-scroll hook that preserves position when reading history (6 unit tests)
- Smooth button transitions and loading pulse animation
- Language label display on code blocks
- VS Code-inspired dark syntax theme
- URL-based room routing: `/{roomId}` links work, page refresh persists room state
- Cloudflare Pages `_redirects` for SPA routing


