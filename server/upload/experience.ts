import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { clampExtractionText, extractExperienceText } from "../text/extract.js";
import { detectFileKind } from "../text/fileType.js";

const ALLOWED_MIME = new Set([
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type UploadResult = {
  fileId: string;
  storageUrl: string;
  extractedText: string;
  contentType: string;
};

export function parseMultipartFormData(body: Buffer, contentTypeHeader: string) {
  const boundaryMatch = contentTypeHeader.match(/boundary=(.+)$/i);
  if (!boundaryMatch) throw new Error("Multipart boundary missing");
  const boundary = `--${boundaryMatch[1]}`;
  const parts = body.toString("latin1").split(boundary).slice(1, -1);

  for (const part of parts) {
    const [rawHeaders, rawData] = part.split("\r\n\r\n");
    if (!rawHeaders || !rawData) continue;
    const disposition = rawHeaders.match(/name="([^"]+)"(?:; filename="([^"]+)")?/i);
    if (!disposition) continue;
    const fieldName = disposition[1];
    const filename = disposition[2];
    if (fieldName !== "file" || !filename) continue;

    const contentTypeMatch = rawHeaders.match(/content-type:\s*([^\r\n]+)/i);
    const contentType = (contentTypeMatch?.[1] || "application/octet-stream").trim();
    const payloadLatin1 = rawData.replace(/\r\n$/, "");
    const data = Buffer.from(payloadLatin1, "latin1");
    return { filename, contentType, data };
  }

  throw new Error('Expected multipart field named "file"');
}

export async function storeExperienceDocument(file: { filename: string; contentType: string; data: Buffer }): Promise<UploadResult> {
  if (!ALLOWED_MIME.has(file.contentType)) {
    throw new Error("Unsupported file type. Allowed: PDF, DOCX, TXT");
  }
  if (!detectFileKind(file.filename, file.contentType, file.data)) {
    throw new Error("Unrecognized file bytes for provided content type.");
  }
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large. Max size is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`);
  }

  const extracted = await extractExperienceText(file.filename, file.contentType, file.data);
  const extractedText = clampExtractionText(extracted.text);
  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileId = `${randomUUID()}-${safeName}`;

  let storageUrl = `inline://${fileId}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`experience/${fileId}`, file.data, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    storageUrl = blob.url;
  }

  return {
    fileId,
    storageUrl,
    extractedText,
    contentType: file.contentType,
  };
}
