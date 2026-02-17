import type { IncomingMessage, ServerResponse } from "http";
import { basicRateLimit } from "../../../server/orchestrator/rateLimit.js";
import { appendChat } from "../../../server/storage/runsRepo.js";
import { chatSchema } from "../../../shared/schemas/api.js";
import { readJson, sendJson } from "../../_utils.js";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string>; socket?: { remoteAddress?: string } },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { error: "runId is required" });

  const ip = req.socket?.remoteAddress || "unknown";
  if (!basicRateLimit(`chat:${ip}`)) return sendJson(res, 429, { error: "Rate limit exceeded" });

  const body = await readJson(req);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });

  await appendChat(runId, "user", parsed.data.message);
  const answer = "Thanks — I stored your message and queued assistant QA context.";
  await appendChat(runId, "assistant", answer);
  return sendJson(res, 200, { reply: answer });
}
