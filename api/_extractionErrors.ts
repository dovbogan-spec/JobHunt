import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ExtractionError } from "../server/text/extract.js";
import { sendJson } from "./_utils.js";

function correlationId(req: IncomingMessage) {
  const supplied = req.headers["x-request-id"];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  return typeof value === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : randomUUID();
}

export function sendExtractionFailure(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
  context: { route: string; format: string },
) {
  const requestId = correlationId(req);
  res.setHeader("X-Request-Id", requestId);

  if (context.format === "unknown" && !(error instanceof ExtractionError)) {
    return sendJson(res, 400, { ok: false, error: "Invalid upload request.", code: "invalid_upload", requestId });
  }

  if (error instanceof ExtractionError && error.kind === "invalid_user_file") {
    return sendJson(res, error.code === "unsupported_document" ? 400 : 422, {
      ok: false,
      error: error.message,
      code: error.code,
      requestId,
    });
  }

  const code = error instanceof ExtractionError ? error.code : "extraction_internal_error";
  console.error(JSON.stringify({
    level: "error",
    event: "document_extraction_failed",
    requestId,
    route: context.route,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.DEPLOYMENT_SHA || "unknown",
    extractionFormat: context.format,
    code,
    exceptionType: error instanceof Error ? error.name : "UnknownError",
  }));

  return sendJson(res, error instanceof ExtractionError ? 503 : 500, {
    ok: false,
    error: error instanceof ExtractionError
      ? "Document extraction service is temporarily unavailable."
      : "Document extraction failed.",
    code,
    requestId,
  });
}
