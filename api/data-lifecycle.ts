import type { IncomingMessage, ServerResponse } from "http";
import { runRetentionCleanup } from "../server/storage/dataLifecycle.js";
import { logServerError, sendJson } from "./_utils.js";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const result = await runRetentionCleanup();
    return sendJson(res, 200, { ok: true, result });
  } catch (error) {
    logServerError("/api/data-lifecycle", error);
    return sendJson(res, 500, { ok: false, error: "Retention cleanup failed" });
  }
}
