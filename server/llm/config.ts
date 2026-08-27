import { isLlmProvider, type LlmProvider } from "../../src/config/modelDefinitions.js";

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  azureOpenai: "gpt-4o-mini",
  gemini: "gemini-1.5-pro",
  openrouter: "openrouter/free",
  custom: "custom",
};

export type LlmRequestSettings = { provider?: LlmProvider; model?: string };

/** Request values win, then provider-specific environment values, then generic values, then defaults. */
export function resolveLlmIdentity(settings: LlmRequestSettings = {}) {
  const environmentProvider = process.env.LLM_PROVIDER;
  const provider = settings.provider ?? (isLlmProvider(environmentProvider) ? environmentProvider : "openai");
  const providerModel = {
    openai: process.env.OPENAI_MODEL,
    anthropic: process.env.ANTHROPIC_MODEL,
    azureOpenai: process.env.AZURE_OPENAI_DEPLOYMENT,
    gemini: process.env.GEMINI_MODEL,
    openrouter: process.env.OPENROUTER_MODEL,
    custom: process.env.CUSTOM_LLM_MODEL,
  }[provider];
  const model = settings.model?.trim() || providerModel?.trim() || process.env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider];
  return { provider, model };
}

export function defaultModel() {
  return resolveLlmIdentity().model;
}
