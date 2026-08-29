import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ServerResponse } from "node:http";
import { createHealthHandler } from "../api/health.js";

function response() {
  const res = new EventEmitter() as ServerResponse & { body?: string; statusCode: number };
  res.statusCode = 200;
  res.setHeader = (() => res) as ServerResponse["setHeader"];
  res.end = ((body?: string) => {
    res.body = body;
    res.emit("finish");
    return res;
  }) as ServerResponse["end"];
  return res;
}

function dependencies(pdfRuntime: { status: "ready" } | { status: "degraded"; code: "pdf_runtime_unavailable" }) {
  return {
    queryDatabase: async () => undefined,
    loadConfig: async () => ({
      defaultModels: { planner: "test", extractor: "test", writer: "test", verifier: "test" },
      featureFlags: { enableCompanyInsights: true, enableBYOK: false, storeExportsInBlob: false },
    }),
    resolveLlm: () => ({ provider: "openai" as const, model: "test" }),
    checkPdf: async () => pdfRuntime,
  };
}

test("health is healthy when the PDF runtime is available", async () => {
  const res = response();
  await createHealthHandler(dependencies({ status: "ready" }))({ method: "GET" } as never, res);
  const body = JSON.parse(res.body || "{}");
  assert.equal(res.statusCode, 200);
  assert.equal(body.status, "healthy");
  assert.deepEqual(body.pdfRuntime, { status: "ready" });
  assert.match(body.deployment.runtime, /^node v/);
});

test("health is degraded with a stable code when the PDF runtime is unavailable", async () => {
  const res = response();
  await createHealthHandler(dependencies({ status: "degraded", code: "pdf_runtime_unavailable" }))(
    { method: "GET" } as never,
    res,
  );
  const body = JSON.parse(res.body || "{}");
  assert.equal(res.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.pdfRuntime, { status: "degraded", code: "pdf_runtime_unavailable" });
});
