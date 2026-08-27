import type { IncomingMessage, ServerResponse } from "node:http";
import { isLlmProvider } from "../../src/config/modelDefinitions.js";
import { logServerError, readJson, sendJson } from "../../api/_utils.js";
import { invokeProvider, type ChatMessage } from "./adapter.js";
import { errorPayload, LlmError } from "./errors.js";
import { resolveLlmIdentity } from "./config.js";

type Body = { provider?: unknown; model?: unknown; messages?: unknown; llmSettings?: { provider?: unknown; model?: unknown; apiKey?: string; customHeaders?: string } };

function parse(body: unknown, ping: boolean) {
  if (!body || typeof body !== "object") throw new LlmError("INVALID_PAYLOAD", "Invalid request payload.", 400, false);
  const value = body as Body;
  if (value.provider !== undefined && !isLlmProvider(value.provider)) throw new LlmError("INVALID_PAYLOAD", "Invalid request payload.", 400, false);
  if (value.llmSettings?.provider !== undefined && !isLlmProvider(value.llmSettings.provider)) throw new LlmError("INVALID_PAYLOAD", "Invalid request payload.", 400, false);
  if (value.llmSettings?.apiKey?.trim() || /^(authorization|x-api-key|api-key|x-goog-api-key|proxy-authorization)\s*:/im.test(value.llmSettings?.customHeaders || "")) {
    throw new LlmError("INVALID_PAYLOAD", "Client-provided credentials are disabled by server policy.", 400, false);
  }
  const provider = value.provider ?? value.llmSettings?.provider;
  const model = typeof value.model === "string" ? value.model : typeof value.llmSettings?.model === "string" ? value.llmSettings.model : undefined;
  const identity = resolveLlmIdentity({ provider: isLlmProvider(provider) ? provider : undefined, model });
  const messages = ping && value.messages === undefined ? [{ role: "user" as const, content: "ping" }] : value.messages;
  if (!Array.isArray(messages) || messages.length === 0) throw new LlmError("NO_MESSAGES", "At least one message is required.", 400, false);
  if (messages.some((message) => !message || typeof message !== "object" || typeof message.content !== "string" || !["system", "user", "assistant"].includes(message.role))) throw new LlmError("INVALID_PAYLOAD", "Invalid request payload.", 400, false);
  return { identity, messages: messages as ChatMessage[] };
}

export async function handleLlm(req: IncomingMessage, res: ServerResponse, operation: "ping" | "chat") {
  if (req.method !== "POST") return sendJson(res, 405, errorPayload(new LlmError("METHOD_NOT_ALLOWED", "Method not allowed.", 405, false)));
  let identity: ReturnType<typeof resolveLlmIdentity> | undefined;
  try {
    const parsed = parse(await readJson(req), operation === "ping");
    identity = parsed.identity;
    const result = await invokeProvider({ ...identity, messages: parsed.messages, ping: operation === "ping" });
    return sendJson(res, 200, { ok: true, provider: identity.provider, requestedModel: identity.model, resolvedModel: result.resolvedModel, retryable: false, connectedAt: new Date().toISOString(), ...(operation === "chat" ? { content: result.content, usage: result.usage } : {}) });
  } catch (error) {
    logServerError(`/api/llm/${operation}`, error);
    const safe = error instanceof LlmError ? error : new LlmError("UPSTREAM_UNAVAILABLE", "Unable to complete LLM request.", 500, true);
    return sendJson(res, safe.status, errorPayload(safe, identity));
  }
}
