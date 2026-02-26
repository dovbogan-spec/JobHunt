import test from "node:test";
import assert from "node:assert/strict";
import { buildResumeExportText } from "../src/utils/resumeVisibility";
import { formatSkillWithLevel, getPreviewExperienceEntries } from "../src/utils/resumeFormatting";

test("formatSkillWithLevel omits parentheses when proficiency is empty", () => {
  assert.equal(formatSkillWithLevel({ skillName: "React", proficiency: "" }), "React");
  assert.equal(formatSkillWithLevel({ skillName: "TypeScript", proficiency: "   " }), "TypeScript");
});

test("hidden experience entries are omitted from preview and export helpers", () => {
  const experience = [
    { id: "exp-1", description: "Launched new checkout", isHidden: false },
    { id: "exp-2", description: "Legacy hidden item", isHidden: true },
    { id: "exp-3", description: "Older hidden item", visible: false },
  ];

  const previewExperience = getPreviewExperienceEntries(experience);
  assert.deepEqual(previewExperience.map((entry) => entry.id), ["exp-1"]);

  const exportText = buildResumeExportText({
    profile: "profile",
    skills: [{ skillName: "React", proficiency: "" }],
    experience,
  });

  assert.equal(exportText.skillsLine, "React");
  assert.deepEqual(exportText.experienceBullets, ["Launched new checkout"]);
});
