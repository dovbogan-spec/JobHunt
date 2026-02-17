import type { IncomingMessage, ServerResponse } from "http";
import { companyInsightsSchema } from "../../shared/schemas/api.js";
import { getConfig } from "../../server/config/edgeConfig.js";
import { readJson, sendJson } from "../_utils.js";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const config = await getConfig();
  if (!config.featureFlags.enableCompanyInsights) {
    return sendJson(res, 200, { skipped: true, reason: "Company insights disabled" });
  }

  const body = await readJson(req);
  const parsed = companyInsightsSchema.safeParse(body);
  if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });

  const { company, role, jdKeywords } = parsed.data;
  const summary = [
    `${company} appears to prioritize ${jdKeywords.slice(0, 3).join(", ") || "role alignment"}.`,
    `Role focus: ${role}.`,
    "Use this signal to tune resume bullets and interview prep notes.",
  ];

  return sendJson(res, 200, { company, role, insights: summary });
}
