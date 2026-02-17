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
4. Set env vars from `.env.example`.
5. Deploy and verify:
   - `GET /api/health` returns `{ ok, openaiConfigured, model, checks }`.

## Troubleshooting

- **Garbled extraction (`!!...端...`)**: file bytes were likely treated as text; verify upload route is using `detectFileKind` + `extractExperienceText`.
- **Run fails on step 2+**: ensure `experience_text` exists (upload experience before starting).
- **PDF export missing in Blob**: check `BLOB_READ_WRITE_TOKEN` and `FEATURE_STORE_EXPORTS_IN_BLOB`.
