import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CvFieldSchema = z
  .object({
    field_id: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["string", "number", "boolean", "array", "object", "null"]),
    max_length: z.number().int().positive(),
    ui_section: z.string().min(1),
    required: z.boolean(),
    default_value: z.unknown(),
    validation: z.record(z.string(), z.unknown()),
    privacy_class: z.enum(["public", "internal", "pii", "sensitive"]),
  })
  .strict();

const CvFieldRegistrySchema = z
  .object({
    version: z.string().min(1),
    fields: z.array(CvFieldSchema).min(1),
  })
  .strict();

export type CvFieldRegistry = z.infer<typeof CvFieldRegistrySchema>;

let cachedRegistry: CvFieldRegistry | null = null;

function assertDefaultValueCompatibility(registry: CvFieldRegistry) {
  for (const field of registry.fields) {
    const value = field.default_value;
    const isCompatible =
      (field.type === "string" && typeof value === "string") ||
      (field.type === "number" && typeof value === "number") ||
      (field.type === "boolean" && typeof value === "boolean") ||
      (field.type === "array" && Array.isArray(value)) ||
      (field.type === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) ||
      (field.type === "null" && value === null);

    if (!isCompatible) {
      throw new Error(`cv_fields registry invalid default for ${field.field_id}: expected ${field.type}`);
    }
  }
}

export async function loadCvFieldRegistry() {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const registryPath = path.join(process.cwd(), "server", "config", "cv_fields.json");
  const raw = await readFile(registryPath, "utf8");
  const parsedJson = JSON.parse(raw) as unknown;
  const parsed = CvFieldRegistrySchema.parse(parsedJson);
  assertDefaultValueCompatibility(parsed);
  cachedRegistry = parsed;
  return parsed;
}

export function validateCvFieldsPayload(
  cvFields: Record<string, unknown>,
  registry: CvFieldRegistry,
): { warnings: string[] } {
  const warnings: string[] = [];
  const knownFields = new Map(registry.fields.map((field) => [field.field_id, field]));

  for (const [fieldId, value] of Object.entries(cvFields)) {
    const field = knownFields.get(fieldId);
    if (!field) {
      warnings.push(`Unknown cv_field '${fieldId}' ignored by registry validator.`);
      continue;
    }

    const valueType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const normalizedType = valueType === "object" ? "object" : valueType;
    if (normalizedType !== field.type) {
      warnings.push(`Field '${fieldId}' expected type '${field.type}' but received '${normalizedType}'.`);
    }
  }

  for (const field of registry.fields) {
    if (field.required && !(field.field_id in cvFields)) {
      warnings.push(`Required field '${field.field_id}' missing from Agent 4 output.`);
    }
  }

  return { warnings };
}

