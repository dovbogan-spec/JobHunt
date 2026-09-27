import test from "node:test";
import assert from "node:assert/strict";
import { createDeploymentRequestHeaders } from "../scripts/smoke-pdf-request.js";

test("builds no deployment protection headers for an unprotected preview", () => {
  assert.deepEqual(createDeploymentRequestHeaders(undefined), {});
});

test("builds Vercel's automation bypass header for a protected preview", () => {
  assert.deepEqual(createDeploymentRequestHeaders("preview-bypass-secret"), {
    "x-vercel-protection-bypass": "preview-bypass-secret",
  });
});
