import type { IncomingMessage, ServerResponse } from "http";
import { getRun } from "../../../server/storage/runsRepo.js";
import { methodNotAllowed, sendJson } from "../../_utils.js";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { error: "runId is required" });

  const snapshot = await getRun(runId);
  if (!snapshot.run) return sendJson(res, 404, { error: "Run not found" });
  return sendJson(res, 200, snapshot);
}
