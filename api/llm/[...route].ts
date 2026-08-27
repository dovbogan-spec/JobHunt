import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../_utils.js";
import { errorPayload, LlmError } from "../../server/llm/errors.js";
import { handleLlm } from "../../server/llm/http.js";

export default function handler(req: IncomingMessage & { query?: Record<string, string | string[] | undefined> }, res: ServerResponse) {
  const raw = req.query?.route;
  const route = Array.isArray(raw) ? raw.join("/") : raw;
  if (route === "chat" || route === "ping") return handleLlm(req, res, route);
  return sendJson(res, 404, errorPayload(new LlmError("NOT_FOUND", "Not found.", 404, false)));
}
