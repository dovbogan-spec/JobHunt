import type { IncomingMessage, ServerResponse } from "http";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { importJdSchema } from "../../shared/schemas/api.js";
import { safeFetchText } from "../../server/security/safeFetch.js";
import { readJson, sendJson } from "../_utils.js";

const DEFAULT_DENYLIST = ["localhost", "*.local", "*.internal"];

type GreenhouseJob = {
  title?: unknown;
  location?: { name?: unknown };
  content?: unknown;
};

export function getGreenhouseApiUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== "job-boards.greenhouse.io") return null;
  const match = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)\/?$/);
  if (!match) return null;

  const [, board, jobId] = match;
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${jobId}`;
}

export function greenhouseJobToText(payload: GreenhouseJob): string {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const location = typeof payload.location?.name === "string" ? payload.location.name.trim() : "";
  const content = typeof payload.content === "string" ? payload.content : "";
  const dom = new JSDOM(`<main>${content}</main>`);
  const description = dom.window.document.querySelector("main")?.textContent?.trim() || "";
  return [title, location, description].filter(Boolean).join("\n\n");
}

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const body = await readJson(req);
  const parsed = importJdSchema.safeParse(body);
  if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });

  const greenhouseApiUrl = getGreenhouseApiUrl(parsed.data.url);
  const fetched = await safeFetchText(greenhouseApiUrl || parsed.data.url, {
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

  if (fetched.status < 200 || fetched.status >= 300) {
    return sendJson(res, 502, {
      error: "upstream_http_error",
      message: `Job page returned HTTP ${fetched.status}`,
      url: fetched.url,
    });
  }

  if (greenhouseApiUrl) {
    try {
      const jdText = greenhouseJobToText(JSON.parse(fetched.text) as GreenhouseJob);
      if (!jdText) throw new Error("Greenhouse returned an empty job description");
      return sendJson(res, 200, { jdText });
    } catch (error) {
      return sendJson(res, 502, {
        error: "invalid_upstream_response",
        message: error instanceof Error ? error.message : "Unable to parse Greenhouse job",
        url: fetched.url,
      });
    }
  }

  const dom = new JSDOM(fetched.text, { url: fetched.url });
  const article = new Readability(dom.window.document).parse();
  const jdText = article?.textContent?.trim() || "";

  if (!jdText) {
    return sendJson(res, 422, { error: "empty_job_description", message: "No job description text was found", url: fetched.url });
  }

  return sendJson(res, 200, { jdText });
}
