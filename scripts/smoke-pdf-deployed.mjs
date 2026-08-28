import { EXPECTED_PHRASE, createPdfBuffer } from "../test/helpers/fixtures.ts";

const baseUrl = (process.env.BASE_URL || process.env.SMOKE_BASE_URL || "").replace(/\/$/, "");

if (!baseUrl) {
  throw new Error("Set BASE_URL (or SMOKE_BASE_URL) to the deployed preview URL");
}

const form = new FormData();
form.append(
  "file",
  new Blob([createPdfBuffer()], { type: "application/pdf" }),
  "experience.pdf",
);

const response = await fetch(`${baseUrl}/api/experience/parse`, {
  method: "POST",
  body: form,
});
const responseBody = await response.text();

if (response.status !== 200) {
  throw new Error(`Expected HTTP 200, received ${response.status}: ${responseBody}`);
}

let result;
try {
  result = JSON.parse(responseBody);
} catch {
  throw new Error(`Expected a JSON response: ${responseBody}`);
}

if (result?.ok !== true) {
  throw new Error(`Expected ok === true: ${responseBody}`);
}
if (result?.extracted?.method !== "pdf_parse") {
  throw new Error(`Expected extracted.method === "pdf_parse": ${responseBody}`);
}

const text = result?.extracted?.text;
if (typeof text !== "string" || text.trim().length < 40 || !text.includes(EXPECTED_PHRASE)) {
  throw new Error(`PDF did not produce meaningful fixture text: ${responseBody}`);
}

console.log(JSON.stringify({
  ok: true,
  method: result.extracted.method,
  chars: text.length,
  preview: text.slice(0, 100),
}, null, 2));
