import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hash, stableStringify } from "../server/storage/hash.js";

test("stableStringify produces deterministic key ordering", () => {
  const a = { b: 2, a: 1, nested: { z: true, y: false } };
  const b = { nested: { y: false, z: true }, a: 1, b: 2 };
  assert.equal(stableStringify(a), stableStringify(b));
});

test("sha256Hash is deterministic for equivalent objects", () => {
  const first = sha256Hash({ run: "1", values: [{ y: 2, x: 1 }] });
  const second = sha256Hash({ values: [{ x: 1, y: 2 }], run: "1" });
  assert.equal(first, second);
});
