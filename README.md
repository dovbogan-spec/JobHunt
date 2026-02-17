# JobHunt Copilot

A Vite + Vercel application for building job-targeted resumes and cover letters with a multi-agent orchestration backend.

## What is implemented

- Interactive UI for resume, cover letter, chat, and history flows.
- Serverless API surface under `api/` for:
  - Runs: create/list/get/start/cancel/step/events
    - Run sub-routes are consolidated under a single catch-all handler: `api/runs/[runId]/[...route].ts` (helps stay within Vercel Hobby function limits)
  - Experience upload extraction + Vercel Blob persistence (`/api/runs/:runId/upload`)
  - Chat persistence
  - JD URL import (`/api/jd/import`)
  - Company insights (`/api/company/insights`)
  - PDF export (`/api/runs/:runId/export/pdf`) using `@react-pdf/renderer`, with optional Blob persistence
  - Health checks (`/api/health`)
- Orchestrator and step runner in `server/orchestrator/` with step idempotency support.
- Agent registry + prompt placeholders in `server/agents/prompts/`.
- PostgreSQL schema in `db/schema.sql` for runs, steps, artifacts, chat, and events.
- Zod request validation in `shared/schemas/api.ts`.
- Basic in-memory rate limiting for `/start` and `/chat`.
## What was fixed
- TS2835 NodeNext build failures in `api/**` and `server/**` by converting relative imports to explicit `.js` extensions.
- Added `/api/health` preflight endpoint with DB + OpenAI + Blob configuration checks.
- Replaced upload placeholder with server-side multipart upload handling for TXT/PDF/DOCX.
- Upload now extracts text server-side and persists `runs.experience_text` + `runs.experience_file_id`.
- Added stricter agent output schema validation in orchestrator (Zod), plus idempotent step skip behavior remains.

## Environment variables
Set these in `.env` locally and in Vercel:

Copy `.env.example` and set the values locally and in Vercel Project Settings:

- `OPENAI_API_KEY` (server-side only)
- `OPENAI_MODEL` (fallback model default)
- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN` (auto-provided when Vercel Blob is attached)
- `EDGE_CONFIG` (auto-provided when Vercel Edge Config is attached)
- Optional fallback feature flags:
  - `FEATURE_ENABLE_COMPANY_INSIGHTS`
  - `FEATURE_ENABLE_BYOK`
  - `FEATURE_STORE_EXPORTS_IN_BLOB`

## Vercel Blob integration

This project stores files in Blob server-side only:

- Experience uploads: `runs/{runId}/uploads/{timestamp}-{filename}`
- Resume PDF exports: `runs/{runId}/exports/{candidate}_CV.pdf`

### Attach Blob in Vercel

1. Go to **Storage** in Vercel Dashboard.
2. Create or attach Blob store `job-hunt-blob`.
3. Connect it to this project/environment.
4. Vercel injects `BLOB_READ_WRITE_TOKEN` automatically.

## Vercel Edge Config integration

Edge Config is used for lightweight defaults + feature flags (no secrets):

- Key `defaultModels`:
  ```json
  {
    "planner": "gpt-5.2",
    "extractor": "gpt-5.2",
    "writer": "gpt-5.2",
    "verifier": "gpt-5.2"
  }
  ```
- Key `featureFlags`:
  ```json
  {
    "enableCompanyInsights": true,
    "enableBYOK": false,
    "storeExportsInBlob": true
  }
  ```

### Attach Edge Config in Vercel

1. Go to **Storage** in Vercel Dashboard.
2. Create or attach Edge Config `job-hunt-store`.
3. Connect it to the project.
4. Vercel injects `EDGE_CONFIG` automatically.

If keys are missing/unavailable, the app falls back safely to env vars (`OPENAI_MODEL` and feature flag envs).

## Health endpoint

`GET /api/health` returns:

- `openaiConfigured`
- `blobConfigured`
- `edgeConfigConfigured`
- `modelDefaults`
- `featureFlags`

No secret values are returned.

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
3. Add Postgres and apply `db/schema.sql`.
4. Attach Blob (`job-hunt-blob`) and Edge Config (`job-hunt-store`) if desired.
5. Ensure env vars from `.env.example` are set.
6. Deploy.
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-5.2`)
- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN` (optional; enables blob upload storage)
- `SEARCH_PROVIDER` and provider key (`TAVILY_API_KEY` / `SERPAPI_API_KEY`) for web insights

## Run locally
```bash
npm install
npm run dev
```

## Build checks
```bash
npm run build
npx tsc -p tsconfig.vercel.json
```

## Smoke test flow
1. Create run
2. Upload experience document
3. Start orchestration
4. Inspect artifacts
5. Export PDF

Commands:
```bash
npm run smoke:upload
```

Manual curl flow:
```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke","jdSourceType":"paste","jdText":"Need TS"}'

curl -X POST http://localhost:3000/api/runs/<RUN_ID>/upload \
  -F "file=@./experience.txt;type=text/plain"

curl -X POST http://localhost:3000/api/runs/<RUN_ID>/start
curl http://localhost:3000/api/runs/<RUN_ID>
curl -X POST http://localhost:3000/api/runs/<RUN_ID>/export/pdf --output resume.pdf
```

## Deploy to Vercel
1. Push branch.
2. In Vercel project settings, set all env vars from `.env.example`.
3. Ensure Postgres schema (`db/schema.sql`) is applied.
4. Redeploy.
5. Verify `GET /api/health` returns `{ ok: true, openaiConfigured: true, model }`.
