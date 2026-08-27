import type { IncomingMessage, ServerResponse } from "node:http";
import { handleLlm } from "../../server/llm/http.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleLlm(req, res, "chat");
}
