import type { IncomingMessage, ServerResponse } from "http";
import { createRunSchema } from "../../shared/schemas/api";
import { createRun, listRuns } from "../../server/storage/runsRepo";
import { methodNotAllowed, readJson, sendJson } from "../_utils";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method === "GET") {
    const runs = await listRuns();
    return sendJson(res, 200, { runs });
  }

  if (req.method === "POST") {
    const payload = await readJson(req);
    const parsed = createRunSchema.safeParse(payload);
    if (!parsed.success) {
      return sendJson(res, 400, { error: parsed.error.flatten() });
    }

    const runId = await createRun(parsed.data);
    return sendJson(res, 201, { runId });
  }

  return methodNotAllowed(res);
}
