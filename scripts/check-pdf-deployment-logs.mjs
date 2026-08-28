import { readFile } from "node:fs/promises";

const logPath = process.argv[2];
if (!logPath) throw new Error("Usage: node scripts/check-pdf-deployment-logs.mjs <log-file>");

const logs = await readFile(logPath, "utf8");
const forbidden = [
  /(?:cannot|could not|failed to) (?:find|load|resolve).*@napi-rs\/canvas/i,
  /@napi-rs\/canvas.*(?:cannot|could not|failed|not found|resolve)/i,
  /(?:DOMMatrix|ImageData|Path2D) is not defined/i,
];
const failure = forbidden.find((pattern) => pattern.test(logs));

if (failure) {
  throw new Error(`PDF deployment logs contain a native/canvas resolution failure (${failure})`);
}

console.log("PDF deployment logs contain no canvas resolution or missing-global failures");
