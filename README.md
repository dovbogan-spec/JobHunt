# JobHunt Copilot

A Vite + Vercel application for building job-targeted resumes and cover letters with a multi-agent orchestration backend.

## What is implemented

- Interactive UI for resume, cover letter, chat, and history flows.
- Serverless API surface under `api/` for:
  - Runs: create/list/get/start/cancel/step/events
  - Upload text extraction placeholder
  - Chat persistence
  - JD URL import (`/api/jd/import`)
  - Company insights (`/api/company/insights`)
  - PDF export (`/api/runs/:runId/export/pdf`) using `@react-pdf/renderer`
- Orchestrator and step runner in `server/orchestrator/` with step idempotency support.
- Agent registry + prompt placeholders in `server/agents/prompts/`.
- PostgreSQL schema in `db/schema.sql` for runs, steps, artifacts, chat, and events.
- Zod request validation in `shared/schemas/api.ts`.
- Basic in-memory rate limiting for `/start` and `/chat`.

## Environment variables

Copy `.env.example` and set the values locally and in Vercel Project Settings:

- `LLM_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SEARCH_PROVIDER`
- `TAVILY_API_KEY` / `SERPAPI_API_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `BLOB_READ_WRITE_TOKEN`
- `ORCHESTRATOR_MAX_STEPS`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repo into Vercel.
3. Add a Postgres database (Neon/Supabase via Marketplace) and apply `db/schema.sql`.
4. (Optional) Add Redis and Blob storage.
5. Configure all environment variables from `.env.example`.
6. Deploy.

## API examples

Create run:

```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Acme - Senior Engineer",
    "jdSourceType":"paste",
    "jdText":"We need React and TypeScript...",
    "candidateName":"Jane Doe",
    "selectedTemplate":"modern_1"
  }'
```

Start run:

```bash
curl -X POST http://localhost:3000/api/runs/<RUN_ID>/start
```

Run a specific step with force:

```bash
curl -X POST "http://localhost:3000/api/runs/<RUN_ID>/step?index=3&force=true"
```

Get history:

```bash
curl http://localhost:3000/api/runs
```
