import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../api/llm/[...route].js";
import chatHandler from "../api/llm/chat.js";
import { resetOpenRouterCaches } from "../server/llm/openRouter.js";

const freeCatalog = {
  data: [{
    id: "test/free", context_length: 16_384,
    pricing: { prompt: "0", completion: "0" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    supported_parameters: ["temperature"],
  }],
};

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
  assert.equal((res.json.error as { code: string }).code, "INVALID_PAYLOAD");
  assert.match((res.json.error as { message: string }).message, /disabled by server policy/);
  assert.equal(res.json.retryable, false);
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
  assert.equal((res.json.error as { code: string }).code, "INVALID_PAYLOAD");
  assert.match((res.json.error as { message: string }).message, /credentials are disabled/);
});

test("OpenRouter ping and chat use the same adapter configuration and selected model", async () => {
  resetOpenRouterCaches();
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "shared-secret";
  process.env.OPENROUTER_MODEL = "openrouter/free";
  process.env.LLM_MODEL = "must-not-override-provider-model";
  const requests: Array<{ url: string; authorization: string | undefined; model: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/models")) return new Response(JSON.stringify(freeCatalog), { status: 200 });
    const headers = init?.headers as Record<string, string>;
    const body = JSON.parse(String(init?.body)) as { model: string };
    requests.push({ url, authorization: headers.Authorization, model: body.model });
    return new Response(JSON.stringify({ model: "test/free", choices: [{ message: { content: "ok" } }] }), { status: 200 });
  };

  try {
    const pingRes = createRes();
    await handler(createReq("ping", { provider: "openrouter" }), pingRes);
    const chatRes = createRes();
    await chatHandler(createReq("chat", { provider: "openrouter", messages: [{ role: "user", content: "Hello" }] }), chatRes);

    assert.equal(pingRes.statusCode, 200);
    assert.equal(chatRes.statusCode, 200);
    assert.deepEqual(
      { provider: pingRes.json.provider, requestedModel: pingRes.json.requestedModel, resolvedModel: pingRes.json.resolvedModel },
      { provider: chatRes.json.provider, requestedModel: chatRes.json.requestedModel, resolvedModel: chatRes.json.resolvedModel },
    );
    assert.ok(requests.length >= 3);
    assert.ok(requests.every((request) => request.url.endsWith("/chat/completions")));
    assert.ok(requests.every((request) => request.authorization === "Bearer shared-secret"));
    assert.ok(requests.every((request) => request.model === "test/free"));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.LLM_MODEL;
    resetOpenRouterCaches();
  }
});

test("chat route sends OpenRouter credentials and attribution only upstream", async () => {
  resetOpenRouterCaches();
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "server-openrouter-secret";
  process.env.OPENROUTER_HTTP_REFERER = "https://jobhunt.example";
  process.env.OPENROUTER_APP_NAME = "JobHunt Tests";
  delete process.env.OPENROUTER_API_URL;
  let upstreamUrl = "";
  let upstreamInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    upstreamInit = init;
    if (upstreamUrl.endsWith("/models")) {
      return new Response(JSON.stringify(freeCatalog), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const req = createReq("chat", {
      provider: "openrouter",
      model: "openrouter/free",
      messages: [{ role: "user", content: "Hello" }],
    });
    const res = createRes();
    await chatHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(upstreamUrl, "https://openrouter.ai/api/v1/chat/completions");
    const headers = upstreamInit?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer server-openrouter-secret");
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["HTTP-Referer"], "https://jobhunt.example");
    assert.equal(headers["X-OpenRouter-Title"], "JobHunt Tests");
    assert.deepEqual(JSON.parse(String(upstreamInit?.body)), {
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.2,
      model: "test/free",
    });
    assert.doesNotMatch(JSON.stringify(res.json), /server-openrouter-secret/);
    assert.equal(res.json.requestedModel, "openrouter/free");
    assert.equal(res.json.resolvedModel, "test/free");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_HTTP_REFERER;
    delete process.env.OPENROUTER_APP_NAME;
  }
});

test("catch-all route uses OpenRouter server configuration instead of OpenAI credentials", async () => {
  resetOpenRouterCaches();
  const originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "openrouter-only-secret";
  process.env.OPENAI_API_KEY = "wrong-openai-secret";
  process.env.OPENROUTER_MODEL = "openrouter/free";
  let upstreamUrl = "";
  let upstreamInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    upstreamInit = init;
    if (upstreamUrl.endsWith("/models")) {
      return new Response(JSON.stringify(freeCatalog), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "pong" } }] }), { status: 200 });
  };

  try {
    const req = createReq("ping", { llmSettings: { provider: "openrouter" } });
    const res = createRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(upstreamUrl, "https://openrouter.ai/api/v1/chat/completions");
    const headers = upstreamInit?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer openrouter-only-secret");
    assert.doesNotMatch(JSON.stringify(upstreamInit), /wrong-openai-secret/);
    assert.equal(JSON.parse(String(upstreamInit?.body)).model, "test/free");
    assert.equal(res.json.requestedModel, "openrouter/free");
    assert.equal(res.json.resolvedModel, "test/free");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  }
});
