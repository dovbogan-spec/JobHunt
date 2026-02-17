import type { IncomingMessage, ServerResponse } from "http";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { importJdSchema } from "../../shared/schemas/api.js";
import { readJson, sendJson } from "../_utils.js";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const body = await readJson(req);
  const parsed = importJdSchema.safeParse(body);
  if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });

  const targetUrl = new URL(parsed.data.url);
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return sendJson(res, 400, { error: "Unsupported URL protocol" });
  }

  const html = await fetch(targetUrl.toString()).then((response) => response.text());
  const dom = new JSDOM(html, { url: targetUrl.toString() });
  const article = new Readability(dom.window.document).parse();
  const jdText = article?.textContent?.trim() || "";

  return sendJson(res, 200, { jdText });
}
