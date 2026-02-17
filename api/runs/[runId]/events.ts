import type { IncomingMessage, ServerResponse } from "http";
import { listEvents } from "../../../server/storage/runsRepo";
import { sendJson } from "../../_utils";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { error: "runId is required" });

  const events = await listEvents(runId);
  return sendJson(res, 200, { events });
}
