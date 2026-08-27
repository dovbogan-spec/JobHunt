import type { IncomingMessage, ServerResponse } from "node:http";
import { connectFreeModel, OpenRouterError } from "../../../server/llm/openRouter.js";
import { logServerError, sendJson } from "../../_utils.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  try {
    const model = await connectFreeModel();
    return sendJson(res, 200, { ok: true, model });
  } catch (error) {
    logServerError("/api/llm/openrouter/connect", error);
    const failure = error instanceof OpenRouterError ? error : new OpenRouterError("EXHAUSTED_CAPACITY", "No free model is currently usable.");
    return sendJson(res, failure.status, { ok: false, error: { code: failure.code, message: failure.message } });
  }
}
