import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../api/runs/[runId]/[...route].js";
import { setPdfRuntimeLoaderForTesting } from "../server/text/extract.js";
import { createPdfBuffer } from "./helpers/fixtures.js";

function request(bytes: Buffer) {
  const boundary = "----jobhunt-run-upload";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="resume.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const req = Readable.from([body]) as IncomingMessage & {
    method?: string;
    query?: Record<string, string | string[]>;
    headers: Record<string, string>;
  };
  req.method = "POST";
  req.query = { runId: "test-run", route: ["upload"] };
  req.headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
  return req;
}

function response() {
  let body = "";
  const res = {
    statusCode: 200,
    setHeader() {},
    end(chunk?: string | Buffer) { body = chunk?.toString() ?? ""; return res; },
    get json() { return JSON.parse(body); },
  } as unknown as ServerResponse & { json: Record<string, unknown> };
  return res;
}

test("run upload returns 422 only for a corrupt user document", async () => {
  const res = response();
  await handler(request(Buffer.from("%PDF-1.7\ninvalid")), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.json.code, "corrupt_document");
  assert.doesNotMatch(JSON.stringify(res.json), /node_modules|\/workspace|stack/i);
});

test("run upload returns a sanitized 503 for a missing PDF dependency", { concurrency: false }, async () => {
  setPdfRuntimeLoaderForTesting(async () => {
    const error = new Error("Cannot find module '/var/task/node_modules/secret/native.node'");
    Object.assign(error, { code: "MODULE_NOT_FOUND" });
    throw error;
  });
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const res = response();
    await handler(request(createPdfBuffer()), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.json.code, "pdf_runtime_unavailable");
    assert.doesNotMatch(JSON.stringify(res.json), /node_modules|native\.node|\/var\/task|Cannot find/i);
  } finally {
    console.error = originalError;
    setPdfRuntimeLoaderForTesting();
  }
});
