import type { IncomingMessage, ServerResponse } from "http";
import { AGENT_PROMPTS, type AgentPromptId } from "../../src/agentPrompts.js";
import { getConfig } from "../../server/config/edgeConfig.js";
import { logServerError, readJson, sendJson } from "../_utils.js";
import { isLlmProvider, type LlmProvider } from "../../src/config/modelDefinitions.js";
import { openRouterChat } from "../../server/llm/openRouter.js";

type LlmSettings = {
  enabled?: boolean;
  provider?: LlmProvider;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  organizationId?: string;
  azureApiVersion?: string;
  customHeaders?: string;
};

type ChatBody = {
  agent: AgentPromptId;
  payload: Record<string, unknown>;
  llmSettings?: LlmSettings;
};

type PingBody = {
  llmSettings?: LlmSettings;
};

function normalizeRoute(route: string | string[] | undefined) {
  if (!route) return "";
  return Array.isArray(route) ? route.join("/") : route;
}

function parseCustomHeaders(raw: string | undefined) {
  const headers: Record<string, string> = {};
  if (!raw?.trim()) return headers;
  raw.split("\n").forEach((line) => {
    const [headerName, ...valueParts] = line.split(":");
    if (!headerName || valueParts.length === 0) return;
    headers[headerName.trim()] = valueParts.join(":").trim();
  });
  return headers;
}

function hasSensitiveHeaders(rawHeaders: string | undefined) {
  const headers = parseCustomHeaders(rawHeaders);
  return Object.keys(headers).some((name) => {
    const normalized = name.trim().toLowerCase();
    return ["authorization", "x-api-key", "api-key", "x-goog-api-key", "proxy-authorization"].includes(normalized);
  });
}

function ensureNoClientSecretsWhenByokDisabled(settings: LlmSettings | undefined) {
  if (!settings) return;
  if (settings.apiKey?.trim()) {
    throw new Error("Client-provided API keys are disabled by server policy");
  }
  if (hasSensitiveHeaders(settings.customHeaders)) {
    throw new Error("Client-provided authentication headers are disabled by server policy");
  }
}

function getProviderDefaults(provider: LlmProvider) {
  if (provider === "anthropic") {
    return {
      endpoint: "https://api.anthropic.com/v1/messages",
      model: "claude-3-5-sonnet-latest",
    };
  }
  if (provider === "gemini") {
    return {
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-1.5-pro",
    };
  }
  if (provider === "azureOpenai") {
    return { endpoint: "", model: "gpt-4o-mini" };
  }
  if (provider === "openrouter") {
    return { endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "openrouter/free" };
  }
  if (provider === "custom") {
    return { endpoint: "", model: "" };
  }
  return {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  };
}

function resolveUpstreamConfig(allowByok: boolean, settings: LlmSettings | undefined) {
  const requestedProvider = settings?.provider || process.env.LLM_PROVIDER;
  const provider: LlmProvider = isLlmProvider(requestedProvider) ? requestedProvider : "openai";
  if (provider === "openrouter") {
    const defaults = getProviderDefaults(provider);
    return {
      provider,
      endpoint: process.env.OPENROUTER_API_URL || defaults.endpoint,
      model: settings?.model?.trim() || process.env.OPENROUTER_MODEL || defaults.model,
      apiKey: process.env.OPENROUTER_API_KEY || "",
      organizationId: "",
      azureApiVersion: "",
      customHeaders: {} as Record<string, string>,
    };
  }
  if (!allowByok) {
    return {
      provider,
      endpoint: process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions",
      model: process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || "",
      organizationId: process.env.OPENAI_ORGANIZATION || "",
      azureApiVersion: "",
      customHeaders: {} as Record<string, string>,
    };
  }

  const defaults = getProviderDefaults(provider);
  return {
    provider,
    endpoint: settings?.endpoint?.trim() || defaults.endpoint,
    model: settings?.model?.trim() || defaults.model,
    apiKey: settings?.apiKey?.trim() || process.env.LLM_API_KEY || "",
    organizationId: settings?.organizationId?.trim() || "",
    azureApiVersion: settings?.azureApiVersion?.trim() || "",
    customHeaders: parseCustomHeaders(settings?.customHeaders),
  };
}

async function callUpstream(
  endpoint: string,
  model: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  provider?: LlmProvider,
) {
  const response = provider === "openrouter" ? await openRouterChat(requestBody) : await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, ...requestBody }),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data, resolvedModel: response.headers.get("X-Resolved-Model") };
}

export default async function handler(
  req: IncomingMessage & {
    method?: string;
    query?: Record<string, string | string[] | undefined>;
  },
  res: ServerResponse,
) {
  const route = normalizeRoute(req.query?.route);
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  if (route !== "chat" && route !== "ping") {
    return sendJson(res, 404, { ok: false, error: "Not found" });
  }

  try {
    const body = (await readJson(req)) as ChatBody | PingBody;
    const config = await getConfig();
    const allowByok = config.featureFlags.enableBYOK;
    ensureNoClientSecretsWhenByokDisabled(body.llmSettings);

    const upstream = resolveUpstreamConfig(allowByok, body.llmSettings);
    if (!upstream.endpoint) {
      return sendJson(res, 400, { ok: false, error: "NO_ENDPOINT_CONFIGURED" });
    }
    if (upstream.provider === "openrouter" && !upstream.apiKey) {
      return sendJson(res, 500, { ok: false, error: "Provider is not configured on the server." });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...upstream.customHeaders,
    };
    if (upstream.apiKey) headers.Authorization = `Bearer ${upstream.apiKey}`;
    if (upstream.organizationId) headers["OpenAI-Organization"] = upstream.organizationId;
    if (upstream.provider === "openrouter") {
      if (process.env.OPENROUTER_HTTP_REFERER) headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
      if (process.env.OPENROUTER_APP_NAME) headers["X-OpenRouter-Title"] = process.env.OPENROUTER_APP_NAME;
    }

    if (route === "ping") {
      const pingBody: Record<string, unknown> = {
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      };

      if (body.llmSettings?.provider === "azureOpenai" && upstream.azureApiVersion) {
        pingBody.apiVersion = upstream.azureApiVersion;
      }

      const response = await callUpstream(upstream.endpoint, upstream.model, headers, pingBody, upstream.provider);
      if (!response.ok) return sendJson(res, response.status, { ok: false, error: `HTTP ${response.status}` });
      const reportedModel = (response.data as { model?: unknown }).model;
      return sendJson(res, 200, {
        ok: true,
        provider: upstream.provider,
        requestedModel: upstream.model,
        resolvedModel: typeof reportedModel === "string" && reportedModel.trim() ? reportedModel : response.resolvedModel || upstream.model,
        connectedAt: new Date().toISOString(),
      });
    }

    const chatBody = body as ChatBody;
    if (!chatBody.agent || !(chatBody.agent in AGENT_PROMPTS)) {
      return sendJson(res, 400, { ok: false, error: "Invalid agent" });
    }

    const requestBody: Record<string, unknown> = {
      messages: [
        { role: "system", content: AGENT_PROMPTS[chatBody.agent] },
        { role: "user", content: JSON.stringify(chatBody.payload || {}) },
      ],
      temperature: 0.2,
    };

    if (body.llmSettings?.provider === "azureOpenai" && upstream.azureApiVersion) {
      requestBody.apiVersion = upstream.azureApiVersion;
    }

    const response = await callUpstream(upstream.endpoint, upstream.model, headers, requestBody, upstream.provider);
    if (!response.ok) return sendJson(res, response.status, { ok: false, error: `HTTP ${response.status}` });

    const content =
      (response.data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content || "{}";
    const reportedModel = (response.data as { model?: unknown }).model;
    return sendJson(res, 200, {
      ok: true,
      provider: upstream.provider,
      requestedModel: upstream.model,
      resolvedModel: typeof reportedModel === "string" && reportedModel.trim() ? reportedModel : response.resolvedModel || upstream.model,
      connectedAt: new Date().toISOString(),
      content,
    });
  } catch (error) {
    logServerError("/api/llm/*", error);
    const message = error instanceof Error ? error.message : "LLM request failed";
    return sendJson(res, 400, { ok: false, error: message });
  }
}
