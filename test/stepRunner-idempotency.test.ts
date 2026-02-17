import test from "node:test";
import assert from "node:assert/strict";
import { hashStepInputs } from "../server/orchestrator/stepRunner.js";

test("hashStepInputs is deterministic for idempotency", () => {
  const input = { run: { jd_text: "a" }, artifacts: [{ type: "x" }], stepIndex: 1 };
  assert.equal(hashStepInputs(input), hashStepInputs(input));
  assert.notEqual(hashStepInputs(input), hashStepInputs({ ...input, stepIndex: 2 }));
});
