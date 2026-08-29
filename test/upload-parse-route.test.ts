import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../api/experience/parse.js";
import { setPdfRuntimeLoaderForTesting } from "../server/text/extract.js";
import { createPdfBuffer } from "./helpers/fixtures.js";

function buildMultipart(filename: string, contentType: string, bytes: Buffer, boundary: string) {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return Buffer.concat([head, bytes, tail]);
}

function createReq(body: Buffer, boundary: string): IncomingMessage & { method?: string } {
  const stream = Readable.from([body]) as IncomingMessage & { method?: string; headers: Record<string, string> };
  stream.method = "POST";
  stream.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.byteLength),
  };
  return stream;
}

function createRes() {
  let payload = Buffer.alloc(0);
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk?: string | Buffer) {
      if (chunk) payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      return res;
    },
    get json() {
      return JSON.parse(payload.toString("utf8"));
    },
  } as unknown as ServerResponse & { json: Record<string, unknown> };

  return res;
}

test("experience parse route accepts PDF upload and returns extracted metadata", async () => {
  const pdf = createPdfBuffer();
  const boundary = "----jobhunt-boundary";
  const req = createReq(buildMultipart("sample.pdf", "application/pdf", pdf, boundary), boundary);
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.json.ok, true);
  assert.ok((res.json.extracted as { chars: number }).chars > 40);
});

test("experience parse route returns 422 for a corrupt user PDF", async () => {
  const boundary = "----jobhunt-corrupt-boundary";
  const pdf = Buffer.from("%PDF-1.7\nthis is not a usable PDF document");
  const req = createReq(buildMultipart("broken.pdf", "application/pdf", pdf, boundary), boundary);
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 422);
  assert.deepEqual(Object.keys(res.json).sort(), ["code", "error", "ok", "requestId"]);
  assert.equal(res.json.code, "corrupt_document");
  assert.doesNotMatch(String(res.json.error), /node_modules|pdf-parse|\/workspace|at /i);
});

test("experience parse route sanitizes PDF runtime failures", { concurrency: false }, async () => {
  const secretModulePath = "/var/task/node_modules/@napi-rs/canvas/native.node";
  setPdfRuntimeLoaderForTesting(async () => {
    const error = new Error(`Cannot find module '${secretModulePath}'`);
    Object.assign(error, { code: "MODULE_NOT_FOUND" });
    throw error;
  });
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (message) => logs.push(String(message));

  try {
    const boundary = "----jobhunt-runtime-boundary";
    const req = createReq(buildMultipart("resume.pdf", "application/pdf", createPdfBuffer(), boundary), boundary);
    const res = createRes();
    await handler(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.json.code, "pdf_runtime_unavailable");
    assert.doesNotMatch(JSON.stringify(res.json), /node_modules|native\.node|\/var\/task|Cannot find/i);
    assert.match(logs[0], /document_extraction_failed/);
    assert.doesNotMatch(logs[0], /node_modules|native\.node|\/var\/task|Cannot find/i);
  } finally {
    console.error = originalError;
    setPdfRuntimeLoaderForTesting();
  }
});
