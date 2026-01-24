# CodeRoom

A realtime pair programming assistant built on Cloudflare's edge infrastructure.

> **🚧 Work in Progress** - See [PLAN.md](./PLAN.md) for the full implementation roadmap.

## What is CodeRoom?

CodeRoom is a web app where you can:
- Create a **room** and paste code
- **Chat** with an AI pair programmer about your code
- Get **persistent memory** that influences future answers
- Run **deep reviews** that produce structured feedback
- See **extracted TODOs** and summaries updated in the background

## How This Satisfies the Assignment

| Requirement | Implementation |
|-------------|----------------|
| **LLM** | Workers AI for pair programming + code review |
| **Workflow/Coordination** | Cloudflare Workflows for summarization, TODO extraction, review reports |
| **Chat Input** | Cloudflare Pages React UI |
| **Memory/State** | Durable Object per room (bounded messages + rolling summary) |

## Tech Stack

- **Frontend**: Vite + React + TypeScript (Cloudflare Pages)
- **Backend**: Cloudflare Worker + Durable Objects
- **AI**: Workers AI (Llama model)
- **Coordination**: Cloudflare Workflows

## Project Structure

```
cf_ai_coderoom/
├── frontend/          # Vite + React app
├── worker/            # Cloudflare Worker + DO + Workflows
├── README.md          # You are here
├── PLAN.md            # Detailed implementation plan
└── PROMPTS.md         # AI prompts used during development
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Cloudflare account (for deployment)
- Wrangler CLI: `npm install -g wrangler`

### Local Development

```bash
# Clone the repo
git clone https://github.com/patrick0f/cf_ai_coderoom.git
cd cf_ai_coderoom

# Install dependencies
npm install

# Start the frontend dev server
npm run dev:frontend

# In another terminal, start the worker
npm run dev:worker
```

Local dev runs at:
- Frontend: http://localhost:5173
- Worker: http://localhost:8787

### Deployment

```bash
# Deploy the worker
npm run deploy:worker

# Deploy the frontend (from frontend/ directory)
cd frontend && npm run build && npx wrangler pages deploy dist --project-name=coderoom
```

**Deployed URLs:**
- Frontend: https://coderoom.pages.dev
- Worker API: https://coderoom-worker.pfung5423.workers.dev

## Try It (2 Minutes)

1. **Visit**: [coderoom.pages.dev](https://coderoom.pages.dev)
2. **Create a room** or use the default one
3. **Paste some code** in the code panel
4. **Ask a question** like "What does this code do?" or "Any bugs here?"
5. **Click Review** for a structured deep analysis
6. **Watch the sidebar** for updated summary and TODOs

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rooms` | Create a new room |
| `GET` | `/api/rooms/:id/snapshot` | Get room state |
| `POST` | `/api/rooms/:id/message` | Send a message |
| `POST` | `/api/rooms/:id/review` | Trigger deep review |
| `POST` | `/api/rooms/:id/reset` | Reset room state |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Pages     │────▶│   Worker    │────▶│  Workers AI │
│   (React)   │     │   (API)     │     │   (Llama)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   Durable   │
                   │   Object    │
                   │ (RoomState) │
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  Workflows  │
                   │ (Background)│
                   └─────────────┘
```

## Development Phases

- [x] **Phase 0**: Repo setup, documentation structure
- [x] **Phase 1**: Cloudflare scaffolding (hello world)
- [x] **Phase 2**: Durable Object RoomState
- [x] **Phase 3**: LLM integration (Workers AI)
- [x] **Phase 4**: Memory distillation workflow
- [ ] **Phase 5**: Deep review mode
- [ ] **Phase 6**: Polish + demo hardening

## License

MIT

---

*Built for the Cloudflare AI Challenge*
