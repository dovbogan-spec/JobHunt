export type SupportedFileKind = "txt" | "pdf" | "docx";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function hasZipSignature(bytes: Buffer) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function hasPdfSignature(bytes: Buffer) {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isLikelyText(bytes: Buffer) {
  if (bytes.length === 0) return true;
  let suspicious = 0;
  const sampleSize = Math.min(bytes.length, 4096);
  for (let i = 0; i < sampleSize; i += 1) {
    const value = bytes[i];
    if (value === 0) return false;
    const isControl = value < 0x09 || (value > 0x0d && value < 0x20);
    if (isControl) suspicious += 1;
  }
  return suspicious / sampleSize < 0.02;
}

export function detectFileKind(filename: string, contentType: string, bytes: Buffer): SupportedFileKind | null {
  const lower = filename.toLowerCase();
  const normalizedType = contentType.toLowerCase();

  if (hasPdfSignature(bytes)) return "pdf";
  if (hasZipSignature(bytes) && (normalizedType.includes(DOCX_MIME) || lower.endsWith(".docx"))) return "docx";

  if (normalizedType.includes("text/plain") || normalizedType.includes("text/markdown")) {
    return isLikelyText(bytes) ? "txt" : null;
  }

  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return isLikelyText(bytes) ? "txt" : null;

  if (isLikelyText(bytes)) return "txt";
  return null;
}
