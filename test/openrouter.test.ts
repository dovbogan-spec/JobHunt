import test from "node:test";
import assert from "node:assert/strict";
import {
  connectFreeModel,
  discoverFreeModels,
  filterAndRankFreeModels,
  OpenRouterError,
  resetOpenRouterCaches,
} from "../server/llm/openRouter.js";

function model(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, name: id, context_length: 16_384,
    pricing: { prompt: "0", completion: "0.000" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    supported_parameters: ["temperature"],
    ...overrides,
  };
}

test("filters exact numeric zero cost and malformed pricing", () => {
  const ranked = filterAndRankFreeModels({ data: [
    model("free"),
    model("paid", { pricing: { prompt: "0.0001", completion: "0" } }),
    model("malformed", { pricing: { prompt: "free", completion: "0" } }),
  ] });
  assert.deepEqual(ranked.map(({ id }) => id), ["free"]);
});

test("filters unsupported modalities, parameters, and context", () => {
  const ranked = filterAndRankFreeModels({ data: [
    model("image", { architecture: { input_modalities: ["image"], output_modalities: ["text"] } }),
    model("no-temperature", { supported_parameters: ["tools"] }),
    model("short", { context_length: 1024 }),
  ] });
  assert.deepEqual(ranked, []);
});

test("ranking is deterministic with preferences before capability and context", () => {
  const ranked = filterAndRankFreeModels({ data: [
    model("large", { context_length: 64_000 }),
    model("preferred", { context_length: 9_000 }),
    model("tools", { supported_parameters: ["temperature", "tools"] }),
  ] }, { preferences: ["preferred"] });
  assert.deepEqual(ranked.map(({ id }) => id), ["preferred", "tools", "large"]);
});

test("candidate probing falls back after rate limits and caches catalog and selection", async () => {
  resetOpenRouterCaches();
  let catalogCalls = 0;
  const probed: string[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    if (String(input).includes("/models")) {
      catalogCalls++;
      return new Response(JSON.stringify({ data: [model("first"), model("second")] }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    probed.push(body.model);
    return new Response("{}", { status: body.model === "first" ? 429 : 200 });
  };
  const options = { fetch: mockFetch, apiKey: "secret", maxProbes: 2 };
  assert.deepEqual(await connectFreeModel(options), { requestedModel: "second", resolvedModel: "second" });
  assert.deepEqual(await connectFreeModel(options), { requestedModel: "second", resolvedModel: "second" });
  assert.equal(catalogCalls, 1);
  assert.deepEqual(probed, ["first", "second"]);
});

test("probe timeouts fall through and report exhausted capacity", async () => {
  resetOpenRouterCaches();
  const mockFetch: typeof fetch = async (input) => {
    if (String(input).includes("/models")) return new Response(JSON.stringify({ data: [model("only")] }), { status: 200 });
    throw new DOMException("timed out", "AbortError");
  };
  await assert.rejects(connectFreeModel({ fetch: mockFetch, apiKey: "secret" }),
    (error: unknown) => error instanceof OpenRouterError && error.code === "EXHAUSTED_CAPACITY");
});

test("distinguishes missing credentials, catalog failure, and no qualifying models", async () => {
  resetOpenRouterCaches();
  await assert.rejects(discoverFreeModels({ apiKey: "" }), (e: unknown) => e instanceof OpenRouterError && e.code === "MISSING_CREDENTIALS");
  await assert.rejects(discoverFreeModels({ apiKey: "x", fetch: async () => new Response("bad", { status: 502 }) }),
    (e: unknown) => e instanceof OpenRouterError && e.code === "CATALOG_FAILURE");
  resetOpenRouterCaches();
  await assert.rejects(connectFreeModel({ apiKey: "x", fetch: async () => new Response(JSON.stringify({ data: [model("paid", { pricing: { prompt: "1", completion: "0" } })] })) }),
    (e: unknown) => e instanceof OpenRouterError && e.code === "NO_QUALIFYING_MODELS");
});
