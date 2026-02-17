# Root cause analysis: garbled experience extraction

## Reproduction summary

The corruption signature (`!!...端...`) is consistent with binary content being decoded as UTF-8 text, typically from PDF/DOCX bytes.

## Exact causes found

1. **Multipart parser path that decodes full multipart body as text**.
   - `server/upload/experience.ts` used `body.toString("latin1")` and part splitting for binary payload parsing, which is brittle and can leak encoding artifacts into downstream text extraction.
2. **Unsafe extraction branch with direct text decoding of only MIME-labeled text**.
   - `server/upload/experience.ts` had direct decoding logic and duplicated extraction behavior instead of centralized robust extraction.
3. **No magic-byte validation before extraction**.
   - Upload routes relied on MIME/extension acceptance and could process mismatched payloads.
4. **No extraction quality guardrails**.
   - There was no threshold/quality check for short or suspiciously corrupted output before persistence.

## Resolution implemented

- Added `detectFileKind()` with magic-byte + MIME + extension checks.
- Centralized extraction in `server/text/extract.ts` with format-specific extractors:
  - TXT: UTF-8 decode with latin1 fallback
  - PDF: `pdf-parse`
  - DOCX: `mammoth`
- Added corruption checks and actionable extraction errors.
- Updated upload route responses to include extraction warnings and file metadata.
- Added tests for TXT/PDF/DOCX fixtures to prevent regression.
