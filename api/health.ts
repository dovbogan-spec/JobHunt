import type { IncomingMessage, ServerResponse } from "http";
import { getDbPool } from "../server/storage/db.js";
import { getConfig } from "../server/config/edgeConfig.js";
import { sendJson } from "./_utils.js";
import { resolveLlmIdentity } from "../server/llm/config.js";
import { checkPdfRuntime, type PdfRuntimeReadiness } from "../server/text/pdfRuntime.js";

type HealthDependencies = {
  queryDatabase: () => Promise<unknown>;
  loadConfig: typeof getConfig;
  resolveLlm: typeof resolveLlmIdentity;
  checkPdf: () => Promise<PdfRuntimeReadiness>;
};

const defaultDependencies: HealthDependencies = {
  queryDatabase: () => getDbPool().query("select 1"),
  loadConfig: getConfig,
  resolveLlm: resolveLlmIdentity,
  checkPdf: checkPdfRuntime,
};

export function createHealthHandler(dependencies: HealthDependencies = defaultDependencies) {
  return async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
    if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

    const checks: Record<string, string> = {};
    let dbOk = false;

    try {
      await dependencies.queryDatabase();
      dbOk = true;
      checks.database = "ok";
    } catch (error) {
      checks.database = error instanceof Error ? error.message : "db check failed";
    }

    checks.blob = process.env.BLOB_READ_WRITE_TOKEN ? "configured" : "not configured (optional)";
    const [config, pdfRuntime] = await Promise.all([dependencies.loadConfig(), dependencies.checkPdf()]);
    checks.pdfRuntime = pdfRuntime.status;

    const llm = dependencies.resolveLlm();
    return sendJson(res, dbOk ? 200 : 500, {
      ok: dbOk,
      status: dbOk ? (pdfRuntime.status === "ready" ? "healthy" : "degraded") : "unhealthy",
      deployment: {
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || "unknown",
        runtime: `node ${process.version}`,
      },
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      provider: llm.provider,
      model: llm.model,
      features: {
        byokEnabled: config.featureFlags.enableBYOK,
      },
      checks,
      pdfRuntime,
    });
  };
}

export default createHealthHandler();
