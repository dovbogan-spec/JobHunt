import type { IncomingMessage, ServerResponse } from "http";
import { executeStep } from "../../../server/orchestrator/stepRunner.js";
import { runStepSchema } from "../../../shared/schemas/api.js";
import { sendJson } from "../../_utils.js";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { error: "runId is required" });

  const parsed = runStepSchema.safeParse(req.query || {});
  if (!parsed.success) {
    return sendJson(res, 400, { error: parsed.error.flatten() });
  }

  const result = await executeStep(runId, parsed.data.index, parsed.data.force);
  return sendJson(res, 200, result);
}
