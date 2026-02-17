import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type BlobPutResult = {
  url: string;
  pathname: string;
  size?: number;
  contentType?: string;
};

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function normalizeBody(body: Buffer | Uint8Array | ArrayBuffer) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(body);
}

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function putLocal(pathname: string, body: Buffer, contentType: string): Promise<BlobPutResult> {
  const localRoot = path.join(process.cwd(), ".local_uploads");
  const fullPath = path.join(localRoot, pathname);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, body);
  return {
    url: `local://${pathname}`,
    pathname,
    size: body.byteLength,
    contentType,
  };
}

export async function putExperienceFile(
  runId: string,
  fileName: string,
  body: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<BlobPutResult> {
  const stamp = Date.now();
  const safeFileName = sanitizeFileName(fileName) || "experience_upload";
  const pathname = `runs/${runId}/uploads/${stamp}-${safeFileName}`;
  const normalizedBody = normalizeBody(body);

  if (!isBlobConfigured()) {
    return putLocal(pathname, normalizedBody, contentType);
  }

  const uploaded = await put(pathname, normalizedBody, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });

  return {
    url: uploaded.url,
    pathname: uploaded.pathname,
    size: normalizedBody.byteLength,
    contentType,
  };
}

export async function putExportPdf(
  runId: string,
  fileName: string,
  body: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<BlobPutResult> {
  const safeFileName = sanitizeFileName(fileName) || "resume_export.pdf";
  const pathname = `runs/${runId}/exports/${safeFileName}`;
  const normalizedBody = normalizeBody(body);

  if (!isBlobConfigured()) {
    return putLocal(pathname, normalizedBody, contentType);
  }

  const uploaded = await put(pathname, normalizedBody, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });

  return {
    url: uploaded.url,
    pathname: uploaded.pathname,
    size: normalizedBody.byteLength,
    contentType,
  };
}
