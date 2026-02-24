import test from "node:test";
import assert from "node:assert/strict";
import { isTransientError, withRetry } from "../server/orchestrator/retry.js";

test("isTransientError identifies retryable classes", () => {
  assert.equal(isTransientError({ code: "ETIMEDOUT" }), true);
  assert.equal(isTransientError({ status: 503 }), true);
  assert.equal(isTransientError({ message: "Provider overloaded, try again later" }), true);
  assert.equal(isTransientError({ status: 400, message: "bad request" }), false);
});

test("withRetry retries transient failures and succeeds", async () => {
  let attempts = 0;
  const value = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error("socket reset") as Error & { code?: string };
        err.code = "ECONNRESET";
        throw err;
      }
      return "ok";
    },
    {
      maxAttempts: 3,
      maxElapsedMs: 5000,
      baseDelayMs: 10,
      maxDelayMs: 25,
    },
  );

  assert.equal(value, "ok");
  assert.equal(attempts, 3);
});
