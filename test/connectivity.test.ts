import test from "node:test";
import assert from "node:assert/strict";
import { connectionLabel, markChangedConnectionStale, modelForRequest, type ConnectionRecords } from "../src/utils/connectivity.js";

const connected: ConnectionRecords = {
  openrouter: {
    status: "success",
    requestedModel: "openrouter/free",
    resolvedModel: "meta-llama/llama-3.3-70b-instruct:free",
    connectedAt: "2026-08-27T12:00:00.000Z",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
  },
};

test("displays and uses the discovered resolved model", () => {
  assert.equal(connectionLabel(connected.openrouter), "Connected: meta-llama/llama-3.3-70b-instruct:free");
  assert.equal(modelForRequest("openrouter/free", connected.openrouter), "meta-llama/llama-3.3-70b-instruct:free");
});

test("changing a model or endpoint removes the stale resolved model name", () => {
  const changedModel = markChangedConnectionStale(connected, "openrouter", "another/model", connected.openrouter?.endpoint || "");
  assert.equal(connectionLabel(changedModel.openrouter), "");
  assert.equal(changedModel.openrouter?.resolvedModel, undefined);

  const changedEndpoint = markChangedConnectionStale(connected, "openrouter", "openrouter/free", "https://example.test/v1");
  assert.equal(connectionLabel(changedEndpoint.openrouter), "");
});
