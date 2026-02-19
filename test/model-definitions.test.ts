import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_CATALOG, getDefaultModel, getModelsForProvider } from "../src/config/modelDefinitions.js";

test("MODEL_CATALOG contains all expected providers", () => {
  const providers = Object.keys(MODEL_CATALOG);
  for (const p of ["openai", "anthropic", "azureOpenai", "gemini", "custom"]) {
    assert.ok(providers.includes(p), `Expected provider ${p} in MODEL_CATALOG`);
  }
});

test("each provider has a label, defaultEndpoint and non-empty models list", () => {
  for (const [key, def] of Object.entries(MODEL_CATALOG)) {
    assert.ok(def.label.length > 0, `${key} should have a label`);
    assert.ok(typeof def.defaultEndpoint === "string", `${key} should have a defaultEndpoint string`);
    assert.ok(def.models.length > 0, `${key} should have at least one model`);
    for (const model of def.models) {
      assert.ok(model.id.length > 0, `${key} model id should be non-empty`);
      assert.ok(model.label.length > 0, `${key} model label should be non-empty`);
    }
  }
});

test("getDefaultModel returns first model id for each provider", () => {
  for (const [key, def] of Object.entries(MODEL_CATALOG)) {
    const expected = def.models[0]?.id ?? "";
    assert.equal(getDefaultModel(key as keyof typeof MODEL_CATALOG), expected);
  }
});

test("getModelsForProvider returns model list for valid provider", () => {
  const openaiModels = getModelsForProvider("openai");
  assert.ok(openaiModels.length > 0);
  assert.ok(openaiModels.some((m) => m.id === "gpt-4o-mini"));
});

test("getModelsForProvider includes only documented Anthropic models", () => {
  const models = getModelsForProvider("anthropic");
  const ids = models.map((m) => m.id);
  // Spot-check known official model IDs
  assert.ok(ids.includes("claude-3-5-sonnet-latest"), "Should include claude-3-5-sonnet-latest");
  assert.ok(ids.includes("claude-3-opus-latest"), "Should include claude-3-opus-latest");
  // Ensure no fabricated model names
  for (const id of ids) {
    assert.ok(id.startsWith("claude-"), `Anthropic model id should start with 'claude-': ${id}`);
  }
});

test("getModelsForProvider includes only documented Gemini models", () => {
  const models = getModelsForProvider("gemini");
  const ids = models.map((m) => m.id);
  assert.ok(ids.includes("gemini-1.5-pro"), "Should include gemini-1.5-pro");
  for (const id of ids) {
    assert.ok(id.startsWith("gemini-"), `Gemini model id should start with 'gemini-': ${id}`);
  }
});
