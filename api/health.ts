import type { IncomingMessage, ServerResponse } from "http";
import { getDbPool } from "../server/storage/db.js";
import { pingOpenAI } from "../server/llm/openai.js";
import { sendJson } from "./_utils.js";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  const checks: Record<string, string> = {};
  let ok = true;

  try { await getDbPool().query("select 1"); checks.database = "ok"; } catch (e) { ok = false; checks.database = e instanceof Error ? e.message : "db failed"; }

  try {
    if (!process.env.OPENAI_API_KEY) {
      checks.openai = "not configured";
      ok = false;
    } else {
      const ping = await pingOpenAI();
      checks.openai = `ok:${ping.model}`;
    }
  } catch (e) {
    ok = false;
    checks.openai = e instanceof Error ? e.message : "openai failed";
  }

  return sendJson(res, ok ? 200 : 500, { ok, openaiConfigured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || "gpt-4o-mini", checks });
}
