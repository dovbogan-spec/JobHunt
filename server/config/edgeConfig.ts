import { get } from "@vercel/edge-config";

type AgentName = "planner" | "extractor" | "writer" | "verifier";

type AppConfig = {
  defaultModels: Record<AgentName, string>;
  featureFlags: {
    enableCompanyInsights: boolean;
    enableBYOK: boolean;
    storeExportsInBlob: boolean;
  };
};

let cache: { at: number; value: AppConfig } | null = null;
const TTL_MS = 10_000;

function envBool(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function fallbackConfig(): AppConfig {
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  return {
    defaultModels: {
      planner: model,
      extractor: model,
      writer: model,
      verifier: model,
    },
    featureFlags: {
      enableCompanyInsights: envBool(process.env.FEATURE_ENABLE_COMPANY_INSIGHTS, true),
      enableBYOK: envBool(process.env.FEATURE_ENABLE_BYOK, false),
      storeExportsInBlob: envBool(process.env.FEATURE_STORE_EXPORTS_IN_BLOB, true),
    },
  };
}

export function isEdgeConfigConfigured() {
  return Boolean(process.env.EDGE_CONFIG);
}

export async function getConfig(): Promise<AppConfig> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return cache.value;
  }

  const fallback = fallbackConfig();
  if (!isEdgeConfigConfigured()) {
    cache = { at: now, value: fallback };
    return fallback;
  }

  try {
    const [modelsFromEdge, flagsFromEdge] = await Promise.all([
      get<Record<string, string>>("defaultModels"),
      get<Record<string, boolean>>("featureFlags"),
    ]);

    const merged: AppConfig = {
      defaultModels: {
        planner: modelsFromEdge?.planner || fallback.defaultModels.planner,
        extractor: modelsFromEdge?.extractor || fallback.defaultModels.extractor,
        writer: modelsFromEdge?.writer || fallback.defaultModels.writer,
        verifier: modelsFromEdge?.verifier || fallback.defaultModels.verifier,
      },
      featureFlags: {
        enableCompanyInsights:
          flagsFromEdge?.enableCompanyInsights ?? fallback.featureFlags.enableCompanyInsights,
        enableBYOK: flagsFromEdge?.enableBYOK ?? fallback.featureFlags.enableBYOK,
        storeExportsInBlob: flagsFromEdge?.storeExportsInBlob ?? fallback.featureFlags.storeExportsInBlob,
      },
    };

    cache = { at: now, value: merged };
    return merged;
  } catch {
    cache = { at: now, value: fallback };
    return fallback;
  }
}
