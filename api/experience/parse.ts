import type { IncomingMessage, ServerResponse } from "http";
import { sendJson } from "../_utils.js";
import { clampExtractionText, extractExperienceText } from "../../server/text/extract.js";
import { detectFileKind } from "../../server/text/fileType.js";
import { parseSingleMultipartFile } from "../../server/text/multipart.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const part = await parseSingleMultipartFile(req, "file");

    if (part.data.byteLength > MAX_UPLOAD_BYTES) {
      return sendJson(res, 413, { ok: false, error: `File too large. Max allowed is ${MAX_UPLOAD_BYTES} bytes.` });
    }

    const kind = detectFileKind(part.filename, part.contentType, part.data);
    if (!kind) {
      return sendJson(res, 400, { ok: false, error: "Unsupported file type. Use pdf/docx/txt/md." });
    }

    const extracted = await extractExperienceText(part.filename, part.contentType, part.data);
    const experienceText = clampExtractionText(extracted.text);

    return sendJson(res, 200, {
      ok: true,
      extracted: {
        chars: experienceText.length,
        method: extracted.method,
        text: experienceText,
        warnings: extracted.warnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return sendJson(res, 400, { ok: false, error: message });
  }
}
