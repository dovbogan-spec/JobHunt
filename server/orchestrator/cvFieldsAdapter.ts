import { type Agent4Output } from "../../shared/schemas/agents/index.js";

type LegacyResumeDraft = {
  label: string;
  receivedKeys: string[];
  generatedAt: string;
  warnings: string[];
  edit_notes: string[];
};

export function adaptCvFieldsToLegacyResumeDraft(output: Agent4Output): LegacyResumeDraft {
  return {
    label: "resume_draft",
    receivedKeys: Object.keys(output.cv_fields),
    generatedAt: new Date().toISOString(),
    warnings: output.warnings,
    edit_notes: output.edit_notes,
  };
}

