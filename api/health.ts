import type { IncomingMessage, ServerResponse } from "http";
import { getDbPool } from "../server/storage/db.js";
import { getConfig } from "../server/config/edgeConfig.js";
import { sendJson } from "./_utils.js";

const model = process.env.OPENAI_MODEL || "gpt-5.2";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  const checks: Record<string, string> = {};
  let dbOk = false;

  try {
    await getDbPool().query("select 1");
    dbOk = true;
    checks.database = "ok";
  } catch (error) {
    checks.database = error instanceof Error ? error.message : "db check failed";
  }

  checks.blob = process.env.BLOB_READ_WRITE_TOKEN ? "configured" : "not configured (optional)";
  const config = await getConfig();

  return sendJson(res, dbOk ? 200 : 500, {
    ok: dbOk,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model,
    features: {
      byokEnabled: config.featureFlags.enableBYOK,
    },
    checks,
  });
}
