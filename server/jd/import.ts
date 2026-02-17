import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export async function fetchJdTextFromUrl(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "JobHuntBot/1.0 (+https://jobhunt.local)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) throw new Error(`Unable to fetch JD page (${response.status})`);
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!text) throw new Error("No readable job description content found");
    return text;
  } finally {
    clearTimeout(timer);
  }
}
