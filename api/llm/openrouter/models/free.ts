import type { IncomingMessage, ServerResponse } from "node:http";
import { discoverFreeModels, OpenRouterError } from "../../../../server/llm/openRouter.js";
import { logServerError, sendJson } from "../../../_utils.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  try {
    const models = await discoverFreeModels();
    return sendJson(res, 200, { ok: true, models });
  } catch (error) {
    logServerError("/api/llm/openrouter/models/free", error);
    const failure = error instanceof OpenRouterError ? error : new OpenRouterError("CATALOG_FAILURE", "Unable to retrieve free models.");
    return sendJson(res, failure.status, { ok: false, error: { code: failure.code, message: failure.message } });
  }
}
