import { del, put } from "@vercel/blob";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type StorageBackend = "blob" | "local";
type ArtifactKind = "resume_upload" | "parsed_profile" | "agent_output" | "resume_pdf" | "profile_snapshot";

type BlobPutResult = {
  artifactId: string;
  pathname: string;
  size?: number;
  contentType?: string;
};

type ResolvedArtifactPointer = {
  backend: StorageBackend;
  pathname: string;
};

const LOCAL_FALLBACK_FLAG = "ALLOW_LOCAL_BLOB_FALLBACK";
const LOCAL_UPLOAD_ROOT = ".local_uploads";


function isPreviewOrProduction() {
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}


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

function isExplicitLocalDevFallbackEnabled() {
  return process.env.NODE_ENV === "development" && process.env[LOCAL_FALLBACK_FLAG] === "true";
}

function buildBlobConfigError() {
  return `Blob storage is required in ${process.env.VERCEL_ENV || process.env.NODE_ENV || "this environment"}. ` +
    "Set BLOB_READ_WRITE_TOKEN to enable private storage, or run local dev with NODE_ENV=development and ALLOW_LOCAL_BLOB_FALLBACK=true.";
}

if (isPreviewOrProduction() && !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error(buildBlobConfigError());
}

function resolveStorageBackend(): StorageBackend {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (isExplicitLocalDevFallbackEnabled()) return "local";
  throw new Error(buildBlobConfigError());
}

function encodeArtifactId(pointer: ResolvedArtifactPointer) {
  return Buffer.from(`${pointer.backend}:${pointer.pathname}`, "utf8").toString("base64url");
}

export function decodeArtifactId(artifactId: string): ResolvedArtifactPointer {
  const decoded = Buffer.from(artifactId, "base64url").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 1) {
    throw new Error("Invalid artifact pointer.");
  }

  const backend = decoded.slice(0, separator);
  const pathname = decoded.slice(separator + 1);
  if ((backend !== "blob" && backend !== "local") || pathname.length === 0 || pathname.includes("..")) {
    throw new Error("Invalid artifact pointer.");
  }

  return { backend, pathname } as ResolvedArtifactPointer;
}

async function putLocal(pathname: string, body: Buffer, contentType: string): Promise<BlobPutResult> {
  const localRoot = path.join(process.cwd(), LOCAL_UPLOAD_ROOT);
  const fullPath = path.join(localRoot, pathname);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, body);
  return {
    artifactId: encodeArtifactId({ backend: "local", pathname }),
    pathname,
    size: body.byteLength,
    contentType,
  };
}

async function putPrivateBlob(pathname: string, body: Buffer, contentType: string): Promise<BlobPutResult> {
  const uploaded = await put(pathname, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
  });

  return {
    artifactId: encodeArtifactId({ backend: "blob", pathname: uploaded.pathname }),
    pathname: uploaded.pathname,
    size: body.byteLength,
    contentType,
  };
}

async function putArtifact(pathname: string, body: Buffer, contentType: string) {
  const backend = resolveStorageBackend();
  if (backend === "local") return putLocal(pathname, body, contentType);
  return putPrivateBlob(pathname, body, contentType);
}

function assertSensitiveKind(kind: ArtifactKind) {
  if (["resume_upload", "parsed_profile", "agent_output", "resume_pdf", "profile_snapshot"].includes(kind)) return;
  throw new Error(`Unsupported artifact kind: ${kind}`);
}

function sanitizePathSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export async function readArtifactBytes(artifactId: string): Promise<{ body: Buffer; contentType: string | null }> {
  const pointer = decodeArtifactId(artifactId);

  if (pointer.backend === "local") {
    if (!isExplicitLocalDevFallbackEnabled()) {
      throw new Error("Local artifact access is disabled outside explicit local development mode.");
    }
    const fullPath = path.join(process.cwd(), LOCAL_UPLOAD_ROOT, pointer.pathname);
    const body = await readFile(fullPath);
    return { body, contentType: null };
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(buildBlobConfigError());
  }

  const baseUrl = process.env.BLOB_PRIVATE_API_URL || "https://blob.vercel-storage.com";
  const response = await fetch(`${baseUrl}/${pointer.pathname}`, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to read artifact (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { body: Buffer.from(arrayBuffer), contentType: response.headers.get("content-type") };
}

async function deleteLocal(pathname: string) {
  const fullPath = path.join(process.cwd(), LOCAL_UPLOAD_ROOT, pathname);
  await rm(fullPath, { force: true });
}

async function deletePrivateBlob(pathname: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(buildBlobConfigError());
  }
  await del(pathname, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function deleteArtifactPath(pathname: string, backend?: StorageBackend) {
  const targetBackend = backend ?? resolveStorageBackend();
  if (targetBackend === "local") {
    if (!isExplicitLocalDevFallbackEnabled()) {
      throw new Error("Local artifact deletion is disabled outside explicit local development mode.");
    }
    await deleteLocal(pathname);
    return;
  }
  await deletePrivateBlob(pathname);
}

export async function deleteArtifactById(artifactId: string) {
  const pointer = decodeArtifactId(artifactId);
  await deleteArtifactPath(pointer.pathname, pointer.backend);
}

export async function putExperienceFile(
  runId: string,
  fileName: string,
  body: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<BlobPutResult> {
  assertSensitiveKind("resume_upload");
  const stamp = Date.now();
  const safeFileName = sanitizeFileName(fileName) || "experience_upload";
  const pathname = `runs/${runId}/uploads/${stamp}-${safeFileName}`;
  return putArtifact(pathname, normalizeBody(body), contentType);
}

export async function putExportPdf(
  runId: string,
  fileName: string,
  body: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<BlobPutResult> {
  assertSensitiveKind("resume_pdf");
  const safeFileName = sanitizeFileName(fileName) || "resume_export.pdf";
  const pathname = `runs/${runId}/exports/${safeFileName}`;
  return putArtifact(pathname, normalizeBody(body), contentType);
}

export async function putRunSnapshotParquet(
  userId: string,
  runId: string,
  snapshotVersion: number,
  body: Buffer | Uint8Array | ArrayBuffer,
): Promise<BlobPutResult> {
  assertSensitiveKind("profile_snapshot");
  const safeUserId = sanitizePathSegment(userId) || "local";
  const pathname = `runs/${runId}/snapshots/${safeUserId}-${runId}-v${snapshotVersion}.parquet`;
  return putArtifact(pathname, normalizeBody(body), "application/vnd.apache.parquet");
}
