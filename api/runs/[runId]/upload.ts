import type { IncomingMessage, ServerResponse } from "http";
import { sendJson } from "../../_utils";
import { putExperienceFile } from "../../../server/storage/blob";
import { saveExperienceUpload } from "../../../server/storage/runsRepo";
import { clampExtractionText, extractExperienceText } from "../../../server/text/extract";
import { parseSingleMultipartFile } from "../../../server/text/multipart";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

function hasAllowedExtension(filename: string) {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
import { getDbPool } from "../../../server/storage/db.js";
import { parseMultipartFormData, storeExperienceDocument } from "../../../server/upload/experience.js";
import { logServerError, readBody, sendJson } from "../../_utils.js";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string>; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { ok: false, error: "runId is required" });

  try {
    const part = await parseSingleMultipartFile(req, "file");

    if (part.data.byteLength > MAX_UPLOAD_BYTES) {
      return sendJson(res, 413, { error: `File too large. Max allowed is ${MAX_UPLOAD_BYTES} bytes.` });
    }

    if (!ALLOWED_MIME.has(part.contentType) && !hasAllowedExtension(part.filename)) {
      return sendJson(res, 400, { error: "Unsupported file type. Use pdf/docx/txt." });
    }

    const uploaded = await putExperienceFile(runId, part.filename, part.data, part.contentType);
    const extracted = await extractExperienceText(part.filename, part.contentType, part.data);
    const experienceText = clampExtractionText(extracted.text);

    await saveExperienceUpload({
      runId,
      fileUrl: uploaded.url,
      filePathname: uploaded.pathname,
      experienceText,
    });

    return sendJson(res, 200, {
      ok: true,
      file: { url: uploaded.url, pathname: uploaded.pathname },
      extracted: { chars: experienceText.length, method: extracted.method },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return sendJson(res, 400, { error: message });
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
