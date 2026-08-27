import type { IncomingMessage, ServerResponse } from "http";
import { logServerError, readJson, sendJson } from "../_utils.js";
import { isLlmProvider, type LlmProvider as SupportedProvider } from "../../src/config/modelDefinitions.js";
import { openRouterChat } from "../../server/llm/openRouter.js";

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type LlmChatBody = {
  provider?: SupportedProvider;
  model?: string;
  messages?: ChatMessage[];
};

const providerDefaults: Record<SupportedProvider, { model: string }> = {
  openai: { model: "gpt-4o-mini" },
  anthropic: { model: "claude-3-5-sonnet-latest" },
  azureOpenai: { model: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini" },
  gemini: { model: "gemini-1.5-pro" },
  openrouter: { model: "openrouter/free" },
  custom: { model: process.env.CUSTOM_LLM_MODEL || "" },
};

function parseRequest(body: unknown): LlmChatBody | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as LlmChatBody;

  if (payload.provider && !isLlmProvider(payload.provider)) {
    return null;
  }

  if (payload.messages && !Array.isArray(payload.messages)) return null;
  if (payload.messages?.some((msg) => !msg || typeof msg.content !== "string" || !["system", "user", "assistant"].includes(msg.role))) {
    return null;
  }

  return payload;
}

function getProviderConfig(provider: SupportedProvider): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "openai": {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_NOT_CONFIGURED");
      return {
        url: process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      };
    }
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_NOT_CONFIGURED");
      return {
        url: process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
          "Content-Type": "application/json",
        },
      };
    }
    case "azureOpenai": {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const apiKey = process.env.AZURE_OPENAI_API_KEY;
      if (!endpoint || !apiKey) throw new Error("AZURE_OPENAI_NOT_CONFIGURED");
      const version = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
      return {
        url: `${endpoint.replace(/\/$/, "")}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini"}/chat/completions?api-version=${version}`,
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
      };
    }
    case "gemini": {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_NOT_CONFIGURED");
      return {
        url: process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        headers: {
          Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
      };
    }
    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_NOT_CONFIGURED");
      return {
        url: process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}),
          ...(process.env.OPENROUTER_APP_NAME ? { "X-OpenRouter-Title": process.env.OPENROUTER_APP_NAME } : {}),
        },
      };
    }
    case "custom": {
      const customUrl = process.env.CUSTOM_LLM_API_URL;
      const customApiKey = process.env.CUSTOM_LLM_API_KEY;
      if (!customUrl || !customApiKey) throw new Error("CUSTOM_NOT_CONFIGURED");
      return {
        url: customUrl,
        headers: {
          Authorization: `Bearer ${customApiKey}`,
          "Content-Type": "application/json",
        },
      };
    }
  }
}

function buildOutboundBody(provider: SupportedProvider, model: string, messages: ChatMessage[]) {
  if (provider === "anthropic") {
    const system = messages.filter((msg) => msg.role === "system").map((msg) => msg.content).join("\n\n");
    const chatMessages = messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content }));

    return {
      model,
      max_tokens: 800,
      ...(system ? { system } : {}),
      messages: chatMessages,
    };
  }

  return {
    model,
    messages,
    temperature: 0.2,
  };
}

function getContentFromProvider(provider: SupportedProvider, data: unknown): string {
  if (provider === "anthropic") {
    const parsed = data as { content?: Array<{ type?: string; text?: string }> } | null;
    return parsed?.content?.find((entry) => entry?.type === "text")?.text || "";
  }

  const parsed = data as { choices?: Array<{ message?: { content?: string } }> } | null;
  return parsed?.choices?.[0]?.message?.content || "";
}

function getUsageFromProvider(provider: SupportedProvider, data: unknown) {
  if (provider === "anthropic") {
    const parsed = data as { usage?: { input_tokens?: number; output_tokens?: number } } | null;
    return {
      input_tokens: parsed?.usage?.input_tokens ?? null,
      output_tokens: parsed?.usage?.output_tokens ?? null,
      total_tokens:
        typeof parsed?.usage?.input_tokens === "number" && typeof parsed?.usage?.output_tokens === "number"
          ? parsed.usage.input_tokens + parsed.usage.output_tokens
          : null,
    };
  }

  const parsed = data as { usage?: unknown } | null;
  return parsed?.usage || null;
}



function normalizeProvider(provider: unknown): SupportedProvider {
  if (isLlmProvider(provider)) return provider;
  return "openai";
}

function mapErrorToSafeMessage(code: string) {
  if (code.endsWith("_NOT_CONFIGURED")) return "Provider is not configured on the server.";
  if (code === "INVALID_PAYLOAD") return "Invalid request payload.";
  if (code === "NO_MESSAGES") return "At least one message is required.";
  return "Unable to complete LLM request.";
}

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const body = parseRequest(await readJson(req));
    if (!body) return sendJson(res, 400, { ok: false, error: mapErrorToSafeMessage("INVALID_PAYLOAD") });

    const provider = normalizeProvider(body.provider || process.env.LLM_PROVIDER);
    const model = (body.model || providerDefaults[provider].model).trim();
    const messages = body.messages || [];

    if (messages.length === 0) {
      return sendJson(res, 400, { ok: false, error: mapErrorToSafeMessage("NO_MESSAGES") });
    }

    const providerConfig = getProviderConfig(provider);
    const outboundBody = buildOutboundBody(provider, model, messages);

    const providerRes = provider === "openrouter"
      ? await openRouterChat(outboundBody)
      : await fetch(providerConfig.url, {
          method: "POST",
          headers: providerConfig.headers,
          body: JSON.stringify(outboundBody),
        });

    const rawText = await providerRes.text();
    const data = rawText ? JSON.parse(rawText) : {};

    if (!providerRes.ok) {
      return sendJson(res, providerRes.status, {
        ok: false,
        error: "Upstream provider request failed.",
        provider,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      provider,
      content: getContentFromProvider(provider, data),
      usage: getUsageFromProvider(provider, data),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    logServerError("/api/llm/chat", error);
    return sendJson(res, 500, {
      ok: false,
      error: mapErrorToSafeMessage(code),
    });
  }
}
