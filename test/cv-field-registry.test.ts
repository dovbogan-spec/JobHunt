import test from "node:test";
import assert from "node:assert/strict";
import { loadCvFieldRegistry, validateCvFieldsPayload } from "../server/config/cvFieldRegistry.js";
import { adaptCvFieldsToLegacyResumeDraft } from "../server/orchestrator/cvFieldsAdapter.js";

test("cv field registry loads and includes version", async () => {
  const registry = await loadCvFieldRegistry();
  assert.equal(typeof registry.version, "string");
  assert.ok(registry.version.length > 0);
  assert.ok(registry.fields.length > 0);
});

test("cv field payload validator reports required fields", async () => {
  const registry = await loadCvFieldRegistry();
  const { warnings } = validateCvFieldsPayload({}, registry);
  assert.ok(warnings.some((warning) => warning.includes("personal.full_name")));
});

test("adapter preserves legacy resume_draft shape", () => {
  const legacy = adaptCvFieldsToLegacyResumeDraft({
    cv_fields: {
      "personal.full_name": "Jane Doe",
      "profile.summary": "Summary",
    },
    warnings: [],
    edit_notes: ["note"],
  });

  assert.equal(legacy.label, "resume_draft");
  assert.deepEqual(legacy.receivedKeys, ["personal.full_name", "profile.summary"]);
  assert.deepEqual(legacy.edit_notes, ["note"]);
});

