import type { LlmProvider } from "../../src/config/modelDefinitions.js";
import { LlmError, normalizeUpstreamError } from "./errors.js";
import { openRouterChat, OpenRouterError } from "./openRouter.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AdapterRequest = { provider: LlmProvider; model: string; messages: ChatMessage[]; ping?: boolean };
export type AdapterResult = { content: string; usage: unknown; resolvedModel: string };

type ProviderConfig = { url: string; headers: Record<string, string> };

function providerConfig(provider: LlmProvider, model: string): ProviderConfig {
  const json = { "Content-Type": "application/json" };
  const credential = (providerKey: string | undefined) => providerKey || process.env.LLM_API_KEY || "";
  if (provider === "openai") {
    const apiKey = credential(process.env.OPENAI_API_KEY);
    if (!apiKey) throw new LlmError("PROVIDER_NOT_CONFIGURED", "Provider is not configured on the server.", 500, false);
    return { url: process.env.OPENAI_API_URL || process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions", headers: { ...json, Authorization: `Bearer ${apiKey}` } };
  }
  if (provider === "anthropic") {
    const apiKey = credential(process.env.ANTHROPIC_API_KEY);
    if (!apiKey) throw new LlmError("PROVIDER_NOT_CONFIGURED", "Provider is not configured on the server.", 500, false);
    return { url: process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", headers: { ...json, "x-api-key": apiKey, "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01" } };
  }
  if (provider === "azureOpenai") {
    if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_API_KEY) throw new LlmError("PROVIDER_NOT_CONFIGURED", "Provider is not configured on the server.", 500, false);
    const version = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
    return { url: `${process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/deployments/${model}/chat/completions?api-version=${version}`, headers: { ...json, "api-key": process.env.AZURE_OPENAI_API_KEY } };
  }
  if (provider === "gemini") {
    const apiKey = credential(process.env.GEMINI_API_KEY);
    if (!apiKey) throw new LlmError("PROVIDER_NOT_CONFIGURED", "Provider is not configured on the server.", 500, false);
    return { url: process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", headers: { ...json, Authorization: `Bearer ${apiKey}` } };
  }
  if (provider === "custom") {
    const apiKey = credential(process.env.CUSTOM_LLM_API_KEY);
    const url = process.env.CUSTOM_LLM_API_URL || process.env.LLM_API_URL;
    if (!url || !apiKey) throw new LlmError("PROVIDER_NOT_CONFIGURED", "Provider is not configured on the server.", 500, false);
    return { url, headers: { ...json, Authorization: `Bearer ${apiKey}` } };
  }
  if (!credential(process.env.OPENROUTER_API_KEY)) throw new LlmError("PROVIDER_NOT_CONFIGURED", "Provider is not configured on the server.", 500, false);
  return { url: "", headers: json };
}

function outbound(request: AdapterRequest) {
  if (request.provider !== "anthropic") return { messages: request.messages, temperature: request.ping ? 0 : 0.2, ...(request.ping ? { max_tokens: 1 } : {}) };
  const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  return { model: request.model, max_tokens: request.ping ? 1 : 800, ...(system ? { system } : {}), messages: request.messages.filter((message) => message.role !== "system") };
}

export async function invokeProvider(request: AdapterRequest): Promise<AdapterResult> {
  const config = providerConfig(request.provider, request.model);
  let response: Response;
  try {
    response = request.provider === "openrouter"
      ? await openRouterChat(outbound(request))
      : await fetch(config.url, { method: "POST", headers: config.headers, body: JSON.stringify({ model: request.model, ...outbound(request) }) });
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (error instanceof OpenRouterError) throw new LlmError(error.code === "MISSING_CREDENTIALS" ? "PROVIDER_NOT_CONFIGURED" : "UPSTREAM_UNAVAILABLE", error.message, error.status, error.code !== "MISSING_CREDENTIALS");
    throw new LlmError("UPSTREAM_UNAVAILABLE", "The provider is temporarily unavailable.", 503, true);
  }
  if (!response.ok) throw normalizeUpstreamError(response.status);
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; } catch { throw new LlmError("UPSTREAM_BAD_RESPONSE", "The provider returned an invalid response.", 502, true); }
  const resolvedModel = typeof data.model === "string" && data.model.trim() ? data.model : response.headers.get("X-Resolved-Model") || request.model;
  if (request.provider === "anthropic") {
    const content = (data.content as Array<{ type?: string; text?: string }> | undefined)?.find((entry) => entry.type === "text")?.text || "";
    const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    return { content, usage: usage ? { ...usage, total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) } : null, resolvedModel };
  }
  const content = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content || "";
  return { content, usage: data.usage ?? null, resolvedModel };
}
