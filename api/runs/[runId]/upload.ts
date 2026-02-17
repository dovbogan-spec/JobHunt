import type { IncomingMessage, ServerResponse } from "http";
import { getDbPool } from "../../../server/storage/db.js";
import { parseMultipartFormData, storeExperienceDocument } from "../../../server/upload/experience.js";
import { logServerError, readBody, sendJson } from "../../_utils.js";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string>; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { ok: false, error: "runId is required" });

  try {
    const contentTypeHeader = String(req.headers["content-type"] || "");
    const body = await readBody(req);

    let file: { filename: string; contentType: string; data: Buffer };
    if (contentTypeHeader.includes("multipart/form-data")) {
      file = parseMultipartFormData(body, contentTypeHeader);
    } else if (contentTypeHeader.includes("text/plain")) {
      file = { filename: "experience.txt", contentType: "text/plain", data: body };
    } else {
      return sendJson(res, 415, { ok: false, error: "Content-Type must be multipart/form-data or text/plain" });
    }

    const stored = await storeExperienceDocument(file);

    await getDbPool().query(
      `update runs set experience_file_id = $2, experience_text = $3, updated_at = now() where id = $1`,
      [runId, stored.storageUrl, stored.extractedText],
    );

    return sendJson(res, 200, {
      ok: true,
      fileId: stored.fileId,
      storageUrl: stored.storageUrl,
      extractedChars: stored.extractedText.length,
      contentType: stored.contentType,
    });
  } catch (error) {
    logServerError("/api/runs/:runId/upload", error, { runId });
    return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "Upload failed" });
  }
}
