import mammoth from "mammoth";
import { detectFileKind } from "./fileType.js";

type ExtractResult = {
  text: string;
  method: string;
  warnings: string[];
};

export type ExtractionErrorKind = "invalid_user_file" | "runtime_failure";

export class ExtractionError extends Error {
  constructor(
    public readonly kind: ExtractionErrorKind,
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExtractionError";
  }
}

type PdfRuntime = typeof import("pdf-parse");
let loadPdfRuntime = () => import("pdf-parse");

/** Test seam for exercising deployment failures without removing installed packages. */
export function setPdfRuntimeLoaderForTesting(loader?: () => Promise<PdfRuntime>) {
  loadPdfRuntime = loader ?? (() => import("pdf-parse"));
}

function invalidFile(code: string, message: string, cause?: unknown): ExtractionError {
  return new ExtractionError("invalid_user_file", code, message, { cause });
}

function runtimeFailure(code: string, cause: unknown): ExtractionError {
  return new ExtractionError("runtime_failure", code, "Document extraction service is unavailable.", { cause });
}

function looksLikeRuntimeFailure(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ERR_DLOPEN_FAILED/.test(code) ||
    /Cannot find (module|package)|polyfill|native binding|shared object|\.node\b|dlopen/i.test(message);
}

const MAX_TEXT_CHARS = 300_000;

function decodeText(bytes: Buffer) {
  const utf8 = bytes.toString("utf8");
  if (!utf8.includes("\uFFFD")) return { text: utf8, method: "plain_text_utf8", warning: null };

  const latin1 = bytes.toString("latin1");
  return {
    text: latin1,
    method: "plain_text_latin1_fallback",
    warning: "Decoded with latin1 fallback due to UTF-8 replacement characters.",
  };
}

function sanitizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function extractionLooksCorrupt(text: string) {
  if (text.length < 40) {
    return "Extracted text is too short. Please upload a text-based PDF/DOCX/TXT.";
  }

  const controlChars = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length;
  const replacements = (text.match(/\uFFFD/g) || []).length;
  const suspiciousRatio = (controlChars + replacements) / text.length;

  if (suspiciousRatio > 0.02) {
    return "Extraction output appears corrupted (high replacement/control-character ratio).";
  }

  return null;
}

export async function extractExperienceText(fileName: string, contentType: string, bytes: Buffer): Promise<ExtractResult> {
  const detectedKind = detectFileKind(fileName, contentType, bytes);
  if (!detectedKind) {
    throw invalidFile("unsupported_document", "Unsupported or unrecognized file type. Use a valid PDF, DOCX, or TXT file.");
  }

  if (detectedKind === "txt") {
    const decoded = decodeText(bytes);
    const text = sanitizeExtractedText(decoded.text);
    const corruptionMessage = extractionLooksCorrupt(text);
    if (corruptionMessage) throw invalidFile("corrupt_document", corruptionMessage);

    const warnings = decoded.warning ? [decoded.warning] : [];
    return { text, method: decoded.method, warnings };
  }

  if (detectedKind === "docx") {
    let extracted;
    try {
      extracted = await mammoth.extractRawText({ buffer: bytes });
    } catch (error) {
      if (looksLikeRuntimeFailure(error)) throw runtimeFailure("docx_dependency_unavailable", error);
      throw invalidFile("corrupt_document", "The DOCX file could not be parsed.", error);
    }
    const text = sanitizeExtractedText(extracted.value || "");
    const corruptionMessage = extractionLooksCorrupt(text);
    if (corruptionMessage) throw invalidFile("corrupt_document", corruptionMessage);

    return { text, method: "docx_mammoth", warnings: extracted.messages.map((message) => message.message) };
  }

  // pdf-parse loads pdf.js and its native canvas polyfills as soon as the module
  // is evaluated. Keep that initialization out of non-PDF upload invocations,
  // and ensure the native canvas package is a direct production dependency so
  // serverless dependency tracing includes it in the deployed function.
  let PDFParse: PdfRuntime["PDFParse"];
  try {
    ({ PDFParse } = await loadPdfRuntime());
    if (typeof PDFParse !== "function") throw new TypeError("PDF parser export is unavailable");
  } catch (error) {
    throw runtimeFailure("pdf_runtime_unavailable", error);
  }

  let parser;
  try {
    parser = new PDFParse({ data: bytes });
  } catch (error) {
    throw runtimeFailure("pdf_parser_initialization_failed", error);
  }

  try {
    let extracted;
    try {
      extracted = await parser.getText();
    } catch (error) {
      if (looksLikeRuntimeFailure(error)) throw runtimeFailure("pdf_runtime_unavailable", error);
      throw invalidFile("corrupt_document", "The PDF file could not be parsed.", error);
    }
    const text = sanitizeExtractedText(extracted.text || "");
    const corruptionMessage = extractionLooksCorrupt(text);
    if (corruptionMessage) throw invalidFile("corrupt_document", corruptionMessage);

    return { text, method: "pdf_parse", warnings: [] };
  } finally {
    await parser.destroy();
  }
}

export function clampExtractionText(text: string) {
  return sanitizeExtractedText(text);
}
