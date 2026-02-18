import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../api/llm/[...route].js";

function createReq(
  route: string,
  body: Record<string, unknown>,
): IncomingMessage & { method?: string; query?: Record<string, string> } {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const stream = Readable.from([payload]) as IncomingMessage & {
    method?: string;
    headers: Record<string, string>;
    query?: Record<string, string>;
  };
  stream.method = "POST";
  stream.query = { route };
  stream.headers = {
    "content-type": "application/json",
    "content-length": String(payload.byteLength),
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

test("llm route rejects client api key when BYOK is disabled", async () => {
  delete process.env.FEATURE_ENABLE_BYOK;
  const req = createReq("ping", {
    llmSettings: {
      apiKey: "sk-test",
    },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.json.ok, false);
  assert.match(String(res.json.error), /disabled by server policy/);
});

test("llm route rejects auth custom headers when BYOK is disabled", async () => {
  delete process.env.FEATURE_ENABLE_BYOK;
  const req = createReq("ping", {
    llmSettings: {
      customHeaders: "Authorization: Bearer test-token",
    },
  });
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.json.ok, false);
  assert.match(String(res.json.error), /authentication headers are disabled/);
});
