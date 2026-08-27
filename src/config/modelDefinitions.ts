/**
 * Official model catalog per vendor.
 *
 * Only models that are officially supported and documented by each provider
 * should be listed here.  Any model that appears in the UI is drawn
 * exclusively from this file so that stale or invalid model IDs cannot be
 * entered by users.
 *
 * Key vendor → available model IDs mapping:
 *   openai       https://platform.openai.com/docs/models
 *   anthropic    https://docs.anthropic.com/en/docs/models-overview
 *   azureOpenai  https://learn.microsoft.com/azure/ai-services/openai/concepts/models
 *   gemini       https://ai.google.dev/gemini-api/docs/models/gemini
 *   openrouter   https://openrouter.ai/docs/features/model-routing
 */

export const LLM_PROVIDERS = ["openai", "anthropic", "azureOpenai", "gemini", "openrouter", "custom"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && (LLM_PROVIDERS as readonly string[]).includes(value);
}

export type ModelDefinition = {
  id: string;
  label: string;
};

export type ProviderDefinition = {
  label: string;
  defaultEndpoint: string;
  models: ModelDefinition[];
};

export const MODEL_CATALOG: Record<LlmProvider, ProviderDefinition> = {
  openai: {
    label: "ChatGPT / OpenAI",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    models: [
      { id: "gpt-4o",           label: "GPT-4o" },
      { id: "gpt-4o-mini",      label: "GPT-4o mini" },
      { id: "gpt-4-turbo",      label: "GPT-4 Turbo" },
      { id: "gpt-4",            label: "GPT-4" },
      { id: "gpt-3.5-turbo",    label: "GPT-3.5 Turbo" },
      { id: "o1",               label: "o1" },
      { id: "o1-mini",          label: "o1 mini" },
      { id: "o3-mini",          label: "o3 mini" },
    ],
  },
  anthropic: {
    label: "Claude / Anthropic",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    models: [
      { id: "claude-opus-4-5",          label: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-5",        label: "Claude Sonnet 4.5" },
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet (latest)" },
      { id: "claude-3-5-haiku-latest",  label: "Claude 3.5 Haiku (latest)" },
      { id: "claude-3-opus-latest",     label: "Claude 3 Opus (latest)" },
    ],
  },
  azureOpenai: {
    label: "Copilot / Azure OpenAI",
    defaultEndpoint: "",
    models: [
      { id: "gpt-4o",        label: "GPT-4o" },
      { id: "gpt-4o-mini",   label: "GPT-4o mini" },
      { id: "gpt-4-turbo",   label: "GPT-4 Turbo" },
      { id: "gpt-4",         label: "GPT-4" },
      { id: "gpt-35-turbo",  label: "GPT-3.5 Turbo" },
      { id: "o1",            label: "o1" },
      { id: "o1-mini",       label: "o1 mini" },
      { id: "o3-mini",       label: "o3 mini" },
    ],
  },
  gemini: {
    label: "Gemini / Google AI",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: [
      { id: "gemini-2.0-flash",         label: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite",    label: "Gemini 2.0 Flash-Lite" },
      { id: "gemini-1.5-pro",           label: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash",         label: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-flash-8b",      label: "Gemini 1.5 Flash-8B" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    defaultEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    models: [
      { id: "openrouter/free", label: "OpenRouter Free Models Router" },
    ],
  },
  custom: {
    label: "Custom endpoint",
    defaultEndpoint: "",
    models: [
      { id: "custom", label: "Custom model" },
    ],
  },
};

/** Default model id for a given provider. */
export function getDefaultModel(provider: LlmProvider): string {
  const def = MODEL_CATALOG[provider];
  return def.models[0]?.id ?? "";
}

/** Return model definitions for a provider, safe for iteration in JSX. */
export function getModelsForProvider(provider: LlmProvider): ModelDefinition[] {
  return MODEL_CATALOG[provider]?.models ?? [];
}
