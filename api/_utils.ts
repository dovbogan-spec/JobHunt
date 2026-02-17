import type { IncomingMessage, ServerResponse } from "http";

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
