# JobHunt Copilot

JobHunt is a Vite + Vercel app for multi-step resume/cover-letter generation with a 6-step server-side orchestrator.

## Key reliability fixes in this version

- Robust file-type detection uses both MIME and magic bytes before extraction.
- TXT/PDF/DOCX extraction is now explicit and safe (no binary-to-UTF8 corruption for PDF/DOCX).
- Upload APIs now return structured extraction metadata, including warnings.
- Experience uploads persist extracted text into `runs.experience_text` and file location into Blob (or local dev fallback storage).
- Orchestrator step execution now fails fast if `jd_text`/`experience_text` are missing and stores step input/output JSON consistently.
- Added extraction/unit tests, route-level upload parsing test, and an end-to-end smoke script.

## Environment setup

Copy `.env.example` to `.env` and set values:

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, default `gpt-5.2`)
- `OPENROUTER_API_KEY` (required when `LLM_PROVIDER=openrouter`; server-side only)
- `OPENROUTER_MODEL` (optional, default `openrouter/free`)
- `OPENROUTER_API_URL` (optional endpoint override)
- `OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_NAME` (optional OpenRouter attribution headers)
- `DATABASE_URL` (required)
- `BLOB_READ_WRITE_TOKEN` (optional; if missing, uploads are stored under `.local_uploads/` in development)
- `EDGE_CONFIG` (optional)
- Feature flag fallbacks:
  - `FEATURE_ENABLE_COMPANY_INSIGHTS`
  - `FEATURE_ENABLE_BYOK`
  - `FEATURE_STORE_EXPORTS_IN_BLOB`

## Local development

```bash
npm install
npm run dev
```


## Date input UX

- All resume date fields (Experience/Education) now use a shared mini-calendar `<DatePicker />` component with month-year selection and optional `Present` for end dates.
- Date values are normalized to `MM/YYYY` and range constrained via shared utilities in `src/utils/datePicker.ts`.

## Checks and tests

```bash
npm run build
npx tsc -p tsconfig.vercel.json
npm test
```

## Smoke test (end-to-end)

Run the app, then execute:

```bash
SMOKE_BASE_URL=http://localhost:5173 npm run smoke:e2e
```

Smoke flow:
1. Create run with JD text
2. Upload sample experience file
3. Start orchestrator and poll to completion
4. Verify artifacts: `parsed_experience`, `tagged_bullets`, `resume_draft`
5. Export PDF and verify response type

## Deployment (Vercel)

1. Import repo into Vercel.
2. Provision Postgres and apply `db/schema.sql`.
3. (Optional) Attach Blob store for production file storage.
4. Define secrets in Vercel Project Environment Variables (Production/Preview/Development as needed):
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - When deploying with OpenRouter: `LLM_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, and optionally `OPENROUTER_MODEL`, `OPENROUTER_API_URL`, `OPENROUTER_HTTP_REFERER`, and `OPENROUTER_APP_NAME`
   - `DATABASE_URL`
   - Optional flags/tokens from `.env.example`
5. If you deploy via GitHub Actions, mirror required values as GitHub Actions secrets and pass them only to server-side build/deploy steps.
6. Keep API routes/server modules (`api/*`, `server/*`) reading provider credentials from `process.env` only. Do not use browser `localStorage` or client-exposed `VITE_*` variables for raw provider keys.
7. BYOK should use token exchange or encrypted server-side storage tied to authenticated users; do not store raw keys in browser storage.
   OpenRouter keys must be configured only as server-side Vercel environment variables; the browser sends only the provider and model selection. Apply variables to every Vercel environment (Production, Preview, or Development) that should use OpenRouter, then redeploy.
8. Deploy and verify:
   - `GET /api/health` returns overall `ok`/`status`, deployment `gitSha` and Node `runtime`, and component checks.
   - PDF readiness loads the dependency and initializes a parser without parsing user content. A failure returns the stable `pdfRuntime.code` `pdf_runtime_unavailable`; loader error text is never exposed.
   - PDF readiness is **degrading, not critical**: an unavailable PDF runtime returns HTTP 200 with `ok: true` and `status: "degraded"` when the database is available. A database failure remains HTTP 500 with `ok: false` and `status: "unhealthy"`.
9. Set the GitHub Actions secret `PRODUCTION_HEALTH_URL` to the production `/api/health` URL. The scheduled production health monitor runs every 15 minutes and fails (triggering the repository's failed-workflow notifications) when the endpoint is unhealthy or PDF readiness is degraded.

## Troubleshooting

- **Garbled extraction (`!!...端...`)**: file bytes were likely treated as text; verify upload route is using `detectFileKind` + `extractExperienceText`.
- **Run fails on step 2+**: ensure `experience_text` exists (upload experience before starting).
- **PDF export missing in Blob**: check `BLOB_READ_WRITE_TOKEN` and `FEATURE_STORE_EXPORTS_IN_BLOB`.
