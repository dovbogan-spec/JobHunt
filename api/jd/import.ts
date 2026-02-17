import type { IncomingMessage, ServerResponse } from "http";
import { importJdSchema } from "../../shared/schemas/api.js";
import { readJson, sendJson } from "../_utils.js";
import { fetchJdTextFromUrl } from "../../server/jd/import.js";

function parseJd(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const skills = Array.from(new Set((normalized.match(/(react|typescript|javascript|node|python|aws|docker|kubernetes|sql|leadership|communication|testing)/gi) || []).map((s) => s.toLowerCase())));
  return {
    title: normalized.split(".")[0]?.slice(0, 120) || "Job Description",
    skills,
    responsibilities: normalized.split(/[\.;]/).map((s) => s.trim()).filter(Boolean).slice(0, 10),
    normalizedText: normalized,
  };
}

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const body = await readJson(req);
  const parsed = importJdSchema.safeParse(body);
  if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });
  try {
    const jdText = parsed.data.text?.trim() || (parsed.data.url ? await fetchJdTextFromUrl(parsed.data.url) : "");
    if (!jdText) return sendJson(res, 400, { error: "JD text was empty" });
    return sendJson(res, 200, { jdText, parsedJd: parseJd(jdText) });
  } catch (e) {
    return sendJson(res, 400, { error: e instanceof Error ? e.message : "JD import failed" });
  }
}
