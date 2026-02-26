import test from "node:test";
import assert from "node:assert/strict";
import { buildResumeExportText, getVisibleEntries, isEntryVisible, normalizeEntryVisibility } from "../src/utils/resumeVisibility";

test("isEntryVisible supports both isHidden and legacy visible fields", () => {
  assert.equal(isEntryVisible({ isHidden: true }), false);
  assert.equal(isEntryVisible({ isHidden: false }), true);
  assert.equal(isEntryVisible({ visible: false }), false);
  assert.equal(isEntryVisible({ visible: true }), true);
  assert.equal(isEntryVisible({}), true);
});

test("visible filtering omits hidden entries from preview/export collections", () => {
  const skills = getVisibleEntries([
    { id: "1", skillName: "React", proficiency: "Advanced", isHidden: false },
    { id: "2", skillName: "Cobol", proficiency: "Beginner", isHidden: true },
    { id: "3", skillName: "TypeScript", proficiency: "Expert", visible: true },
    { id: "4", skillName: "Legacy Hidden", proficiency: "Beginner", visible: false },
  ]);

  assert.deepEqual(
    skills.map((entry) => entry.id),
    ["1", "3"],
  );

  const exportText = buildResumeExportText({
    profile: "profile",
    skills,
    experience: [
      { description: "Shipped feature A", isHidden: false },
      { description: "Legacy item", visible: false },
    ],
  });

  assert.equal(exportText.skillsLine.includes("Cobol"), false);
  assert.equal(exportText.skillsLine.includes("Legacy Hidden"), false);
  assert.deepEqual(exportText.experienceBullets, ["Shipped feature A"]);
});

test("normalizeEntryVisibility writes both fields consistently", () => {
  assert.deepEqual(normalizeEntryVisibility({ id: "1", visible: false }), {
    id: "1",
    isHidden: true,
    visible: false,
  });
  assert.deepEqual(normalizeEntryVisibility({ id: "2", isHidden: false }), {
    id: "2",
    isHidden: false,
    visible: true,
  });
});
