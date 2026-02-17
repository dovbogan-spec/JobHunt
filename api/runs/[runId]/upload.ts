import type { IncomingMessage, ServerResponse } from "http";
import { sendJson } from "../../_utils.js";
import { putExperienceFile } from "../../../server/storage/blob.js";
import { saveExperienceUpload } from "../../../server/storage/runsRepo.js";
import { clampExtractionText, extractExperienceText } from "../../../server/text/extract.js";
import { parseSingleMultipartFile } from "../../../server/text/multipart.js";

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

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { ok: false, error: "runId is required" });

  try {
    const part = await parseSingleMultipartFile(req, "file");

    if (part.data.byteLength > MAX_UPLOAD_BYTES) {
      return sendJson(res, 413, { ok: false, error: `File too large. Max allowed is ${MAX_UPLOAD_BYTES} bytes.` });
    }

    if (!ALLOWED_MIME.has(part.contentType) && !hasAllowedExtension(part.filename)) {
      return sendJson(res, 400, { ok: false, error: "Unsupported file type. Use pdf/docx/txt." });
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
    return sendJson(res, 400, { ok: false, error: message });
  }
}
