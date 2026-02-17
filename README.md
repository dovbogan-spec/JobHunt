# JobHunt Copilot

## What was fixed
- TS2835 NodeNext build failures in `api/**` and `server/**` by converting relative imports to explicit `.js` extensions.
- Added `/api/health` preflight endpoint with DB + OpenAI + Blob configuration checks.
- Replaced upload placeholder with server-side multipart upload handling for TXT/PDF/DOCX.
- Upload now extracts text server-side and persists `runs.experience_text` + `runs.experience_file_id`.
- Added stricter agent output schema validation in orchestrator (Zod), plus idempotent step skip behavior remains.

## Environment variables
Set these in `.env` locally and in Vercel:

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
