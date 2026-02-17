import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

type ExtractResult = {
  text: string;
  method: string;
};

export async function extractExperienceText(fileName: string, contentType: string, bytes: Buffer): Promise<ExtractResult> {
  const lowerName = fileName.toLowerCase();

  if (contentType.includes("text/plain") || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    return { text: bytes.toString("utf8"), method: "plain_text" };
  }

  if (
    contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
    lowerName.endsWith(".docx")
  ) {
    const extracted = await mammoth.extractRawText({ buffer: bytes });
    return { text: extracted.value, method: "docx_mammoth" };
  }

  if (contentType.includes("application/pdf") || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: bytes });
    const extracted = await parser.getText();
    return { text: extracted.text || "", method: "pdf_parse" };
  }

  throw new Error("Unsupported file type for extraction");
}

export function clampExtractionText(text: string) {
  return text.split("\x00").join("").slice(0, 300_000);
}
