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

export function logServerError(route: string, error: unknown, extra?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ level: "error", route, message, ...extra }));
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
