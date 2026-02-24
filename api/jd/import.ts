import type { IncomingMessage, ServerResponse } from "http";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { importJdSchema } from "../../shared/schemas/api.js";
import { safeFetchText } from "../../server/security/safeFetch.js";
import { readJson, sendJson } from "../_utils.js";

const DEFAULT_DENYLIST = ["localhost", "*.local", "*.internal"];

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const body = await readJson(req);
  const parsed = importJdSchema.safeParse(body);
  if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });

  const fetched = await safeFetchText(parsed.data.url, {
    timeoutMs: 8_000,
    maxResponseBytes: 2 * 1024 * 1024,
    maxRedirects: 3,
    denylist: DEFAULT_DENYLIST,
  });

  if (!fetched.ok) {
    const status = fetched.category === "invalid_url" ? 400 : fetched.category === "blocked_host" ? 403 : fetched.category === "timeout" ? 504 : 502;
    return sendJson(res, status, {
      error: fetched.category,
      message: fetched.message,
      url: fetched.url,
    });
  }

  const dom = new JSDOM(fetched.text, { url: fetched.url });
  const article = new Readability(dom.window.document).parse();
  const jdText = article?.textContent?.trim() || "";

  return sendJson(res, 200, { jdText });
}
