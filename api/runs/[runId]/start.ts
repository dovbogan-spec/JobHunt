import type { IncomingMessage, ServerResponse } from "http";
import { basicRateLimit } from "../../../server/orchestrator/rateLimit.js";
import { startRun } from "../../../server/orchestrator/stepRunner.js";
import { sendJson } from "../../_utils.js";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string>; socket?: { remoteAddress?: string } },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { error: "runId is required" });

  const ip = req.socket?.remoteAddress || "unknown";
  if (!basicRateLimit(`start:${ip}`)) {
    return sendJson(res, 429, { error: "Rate limit exceeded" });
  }

  const result = await startRun(runId);
  return sendJson(res, 200, result);
}
