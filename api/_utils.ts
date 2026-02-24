import type { IncomingMessage, ServerResponse } from "http";
import { createHash } from "node:crypto";

export async function readJson(req: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Uint8Array);
  }
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(raw);
}

export async function readBody(req: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Uint8Array);
  }
  return Buffer.concat(chunks);
}

export function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export function methodNotAllowed(res: ServerResponse) {
  sendJson(res, 405, { ok: false, error: "Method not allowed" });
}

const SENSITIVE_FIELD_PATTERN = /(resume|experience|jd_text|content|artifact|blob|token|authorization|api[-_]?key|password|secret)/i;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 180) return `[redacted:length=${value.length}]`;
    return value;
  }

  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_FIELD_PATTERN.test(key) ? "[redacted]" : redactValue(nested);
    }
    return out;
  }

  return value;
}

export function logServerError(route: string, error: unknown, extra?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const safe = redactValue(extra ?? {}) as Record<string, unknown>;
  console.error(JSON.stringify({ level: "error", route, message, sensitive: true, ...safe }));
}


export function getIdempotencyKey(req: IncomingMessage) {
  const value = req.headers["idempotency-key"] ?? req.headers["x-idempotency-key"];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function hashRequest(value: unknown) {
  const normalized = JSON.stringify(value ?? {});
  return createHash("sha256").update(normalized).digest("hex");
}
