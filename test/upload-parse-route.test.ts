import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../api/experience/parse.js";
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
