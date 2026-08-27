import { z } from "zod";

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const catalogModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  context_length: z.number().int().positive(),
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
  }),
  architecture: z.object({
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
    modality: z.string().optional(),
  }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  top_provider: z.object({
    context_length: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().nullable().optional(),
    is_moderated: z.boolean().optional(),
  }).optional(),
});

const catalogSchema = z.object({ data: z.array(catalogModelSchema) });
type CatalogModel = z.infer<typeof catalogModelSchema>;

export type FreeModel = {
  id: string;
  name: string;
  contextLength: number;
  maxCompletionTokens: number | null;
  supportsTools: boolean;
  moderated: boolean;
};

export type OpenRouterFailureCode =
  | "MISSING_CREDENTIALS"
  | "CATALOG_FAILURE"
  | "NO_QUALIFYING_MODELS"
  | "EXHAUSTED_CAPACITY";

export class OpenRouterError extends Error {
  constructor(public readonly code: OpenRouterFailureCode, message: string, public readonly status = 503) {
    super(message);
    this.name = "OpenRouterError";
  }
}

type CacheEntry<T> = { value: T; expiresAt: number };
let catalogCache: CacheEntry<FreeModel[]> | undefined;
let selectedCache: CacheEntry<string> | undefined;

type Options = {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  apiKey?: string;
  preferences?: string[];
  allowlist?: string[];
  catalogTtlMs?: number;
  selectedTtlMs?: number;
  timeoutMs?: number;
  maxProbes?: number;
  minimumContext?: number;
  catalogUrl?: string;
  chatUrl?: string;
};

function positiveInteger(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function csv(raw: string | undefined) {
  return raw?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function config(options: Options = {}) {
  return {
    fetch: options.fetch ?? globalThis.fetch,
    now: options.now ?? Date.now,
    apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "",
    preferences: options.preferences ?? csv(process.env.OPENROUTER_FREE_MODEL_PREFERENCES),
    allowlist: options.allowlist ?? csv(process.env.OPENROUTER_FREE_MODEL_ALLOWLIST),
    catalogTtlMs: options.catalogTtlMs ?? positiveInteger(process.env.OPENROUTER_CATALOG_TTL_MS, 5 * 60_000),
    selectedTtlMs: options.selectedTtlMs ?? positiveInteger(process.env.OPENROUTER_SELECTED_MODEL_TTL_MS, 10 * 60_000),
    timeoutMs: options.timeoutMs ?? positiveInteger(process.env.OPENROUTER_PROBE_TIMEOUT_MS, 4_000),
    maxProbes: options.maxProbes ?? positiveInteger(process.env.OPENROUTER_MAX_PROBES, 4),
    minimumContext: options.minimumContext ?? positiveInteger(process.env.OPENROUTER_MIN_CONTEXT_LENGTH, 8_192),
    catalogUrl: options.catalogUrl ?? process.env.OPENROUTER_MODELS_URL ?? CATALOG_URL,
    chatUrl: options.chatUrl ?? process.env.OPENROUTER_API_URL ?? CHAT_URL,
  };
}

function exactZero(value: string) {
  if (!/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(value)) return false;
  return Number(value) === 0;
}

function isChatCapable(model: CatalogModel, minimumContext: number) {
  const input = model.architecture?.input_modalities;
  const output = model.architecture?.output_modalities;
  const modality = model.architecture?.modality?.toLowerCase();
  const supportsTextInput = input ? input.includes("text") : modality?.includes("text") === true;
  const supportsTextOutput = output ? output.includes("text") : modality?.split("->")[1]?.includes("text") === true;
  const contextLength = model.top_provider?.context_length ?? model.context_length;
  const parameters = model.supported_parameters;
  return supportsTextInput && supportsTextOutput && contextLength >= minimumContext &&
    (!parameters || parameters.includes("temperature"));
}

export function filterAndRankFreeModels(raw: unknown, options: Pick<Options, "preferences" | "allowlist" | "minimumContext"> = {}) {
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success) throw new OpenRouterError("CATALOG_FAILURE", "The OpenRouter catalog response was invalid.");
  const preferences = options.preferences ?? [];
  const preferenceRank = new Map(preferences.map((id, index) => [id, index]));
  const allowlist = options.allowlist ?? [];
  const minimumContext = options.minimumContext ?? 8_192;

  return parsed.data.data
    .filter((model) => exactZero(model.pricing.prompt) && exactZero(model.pricing.completion))
    .filter((model) => allowlist.length === 0 || allowlist.includes(model.id))
    .filter((model) => isChatCapable(model, minimumContext))
    .map<FreeModel>((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.top_provider?.context_length ?? model.context_length,
      maxCompletionTokens: model.top_provider?.max_completion_tokens ?? null,
      supportsTools: model.supported_parameters?.includes("tools") ?? false,
      moderated: model.top_provider?.is_moderated ?? false,
    }))
    .sort((a, b) => {
      const aPreference = preferenceRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bPreference = preferenceRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aPreference - bPreference || Number(b.supportsTools) - Number(a.supportsTools) ||
        b.contextLength - a.contextLength || a.id.localeCompare(b.id);
    });
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}),
    ...(process.env.OPENROUTER_APP_NAME ? { "X-OpenRouter-Title": process.env.OPENROUTER_APP_NAME } : {}),
  };
}

function credentials(apiKey: string) {
  if (!apiKey) throw new OpenRouterError("MISSING_CREDENTIALS", "OpenRouter is not configured on the server.", 500);
}

export async function discoverFreeModels(options: Options = {}): Promise<FreeModel[]> {
  const c = config(options);
  credentials(c.apiKey);
  if (catalogCache && catalogCache.expiresAt > c.now()) return catalogCache.value;
  let response: Response;
  try {
    response = await c.fetch(c.catalogUrl, { headers: headers(c.apiKey), signal: AbortSignal.timeout(c.timeoutMs) });
  } catch {
    throw new OpenRouterError("CATALOG_FAILURE", "Unable to retrieve the OpenRouter model catalog.");
  }
  if (!response.ok) throw new OpenRouterError("CATALOG_FAILURE", "Unable to retrieve the OpenRouter model catalog.");
  let body: unknown;
  try { body = await response.json(); } catch { throw new OpenRouterError("CATALOG_FAILURE", "The OpenRouter catalog response was invalid."); }
  const models = filterAndRankFreeModels(body, c);
  catalogCache = { value: models, expiresAt: c.now() + c.catalogTtlMs };
  return models;
}

const retryableStatuses = new Set([404, 408, 409, 429, 500, 502, 503, 504]);

async function request(model: string, body: Record<string, unknown>, c: ReturnType<typeof config>) {
  return c.fetch(c.chatUrl, {
    method: "POST",
    headers: headers(c.apiKey),
    signal: AbortSignal.timeout(c.timeoutMs),
    body: JSON.stringify({ ...body, model }),
  });
}

export async function connectFreeModel(options: Options = {}) {
  const c = config(options);
  credentials(c.apiKey);
  if (selectedCache && selectedCache.expiresAt > c.now()) return selectedCache.value;
  const candidates = await discoverFreeModels(options);
  if (candidates.length === 0) throw new OpenRouterError("NO_QUALIFYING_MODELS", "No free model meets the chat requirements.");
  for (const candidate of candidates.slice(0, c.maxProbes)) {
    try {
      const response = await request(candidate.id, {
        messages: [{ role: "user", content: "Reply OK" }], max_tokens: 1, temperature: 0,
      }, c);
      if (response.ok) {
        selectedCache = { value: candidate.id, expiresAt: c.now() + c.selectedTtlMs };
        return candidate.id;
      }
      if (!retryableStatuses.has(response.status)) continue;
    } catch { /* A timeout/network failure only rejects this candidate. */ }
  }
  throw new OpenRouterError("EXHAUSTED_CAPACITY", "All probed free models are currently unavailable.");
}

export async function openRouterChat(body: Record<string, unknown>, options: Options = {}) {
  const c = config(options);
  credentials(c.apiKey);
  const model = await connectFreeModel(options);
  try {
    const response = await request(model, body, c);
    if (response.ok || !retryableStatuses.has(response.status)) return response;
  } catch { /* Rediscover once after transient selected-model failure. */ }
  selectedCache = undefined;
  const replacement = await connectFreeModel(options);
  return request(replacement, body, c);
}

export function resetOpenRouterCaches() {
  catalogCache = undefined;
  selectedCache = undefined;
}
