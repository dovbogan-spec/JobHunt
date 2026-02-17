import type { IncomingMessage, ServerResponse } from "http";
import { updateRunStatus } from "../../../server/storage/runsRepo";
import { sendJson } from "../../_utils";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { error: "runId is required" });

  await updateRunStatus(runId, "cancelled");
  return sendJson(res, 200, { ok: true });
}
