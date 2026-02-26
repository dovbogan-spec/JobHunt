import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Zod schemas for the resume-section-guidelines.json file           */
/* ------------------------------------------------------------------ */

const FieldSchema = z.object({
  type: z.enum(["string", "array"]),
  required: z.boolean(),
  cv_field_ref: z.string().optional(),
  format: z.string().optional(),
  max_length: z.number().int().positive().optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
  example: z.unknown().optional(),
  item_format: z.record(z.string(), z.unknown()).optional(),
  enum: z.array(z.string()).optional(),
}).passthrough();

const SectionSchema = z.object({
  section_label: z.string().min(1),
  order: z.number().int().positive(),
  description: z.string().min(1),
  fields: z.record(z.string(), FieldSchema),
  rules: z.array(z.string()).min(1),
  keyword_rules: z.array(z.string()).min(1),
  formatting_constraints: z.array(z.string()).min(1),
  prioritization_logic: z.array(z.string()).min(1),
});

const GuidelineSchema = z.object({
  version: z.string().min(1),
  description: z.string().min(1),
  section_order: z.array(z.string()).min(1),
  sections: z.record(z.string(), SectionSchema),
  global_formatting_rules: z.object({
    section_order: z.array(z.string()).min(1),
    date_format: z.string().min(1),
    bullet_points: z.string().min(1),
    fonts: z.string().min(1),
    layout: z.string().min(1),
    prohibited_elements: z.array(z.string()).min(1),
    ats_compatibility: z.array(z.string()).min(1),
  }),
  keyword_extraction_rules: z.object({
    description: z.string().min(1),
    extraction_steps: z.array(z.string()).min(1),
    normalization_rules: z.array(z.string()).min(1),
    section_mapping: z.record(z.string(), z.string()),
  }),
  tailoring_rules: z.object({
    description: z.string().min(1),
    rules: z.array(z.string()).min(1),
  }),
  validation_rules: z.object({
    description: z.string().min(1),
    rules: z.array(z.string()).min(1),
  }),
});

export type ResumeGuideline = z.infer<typeof GuidelineSchema>;
export type ResumeGuidelineSection = z.infer<typeof SectionSchema>;

/* ------------------------------------------------------------------ */
/*  Loader                                                             */
/* ------------------------------------------------------------------ */

let cachedGuideline: ResumeGuideline | null = null;

export async function loadResumeGuideline(): Promise<ResumeGuideline> {
  if (cachedGuideline) return cachedGuideline;

  const guidelinePath = path.join(process.cwd(), "docs", "resume-section-guidelines.json");
  const raw = await readFile(guidelinePath, "utf8");
  const parsed = GuidelineSchema.parse(JSON.parse(raw));

  // Verify section_order matches actual section keys
  const sectionKeys = Object.keys(parsed.sections);
  for (const id of parsed.section_order) {
    if (!sectionKeys.includes(id)) {
      throw new Error(`section_order references unknown section '${id}'`);
    }
  }

  cachedGuideline = parsed;
  return parsed;
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

/**
 * Collects every `cv_field_ref` value declared across all sections so
 * callers can cross-check against the cv-field registry.
 */
export function collectCvFieldRefs(guideline: ResumeGuideline): string[] {
  const refs: string[] = [];
  for (const section of Object.values(guideline.sections)) {
    for (const field of Object.values(section.fields)) {
      if (field.cv_field_ref) refs.push(field.cv_field_ref);
    }
  }
  return refs;
}
