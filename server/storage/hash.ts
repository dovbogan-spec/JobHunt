import { createHash } from "node:crypto";

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSort(entry));
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const record = value as Record<string, unknown>;
        acc[key] = stableSort(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(stableSort(value));
}

export function sha256Hash(value: unknown) {
  const input = typeof value === "string" ? value : stableStringify(value);
  return createHash("sha256").update(input).digest("hex");
}
