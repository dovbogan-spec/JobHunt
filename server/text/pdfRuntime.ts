export type PdfRuntimeReadiness =
  | { status: "ready" }
  | { status: "degraded"; code: "pdf_runtime_unavailable" };

type PdfParser = { destroy(): Promise<void> };
type PdfRuntimeLoader = () => Promise<{
  PDFParse: new (options: { data: Uint8Array }) => PdfParser;
}>;

const loadPdfRuntime: PdfRuntimeLoader = () => import("pdf-parse");

/**
 * Loads pdf.js and constructs the parser, but deliberately does not ask it to
 * load or parse a document. This verifies the deployed native/module runtime
 * without sending synthetic or user content through the parser.
 */
export async function checkPdfRuntime(loader: PdfRuntimeLoader = loadPdfRuntime): Promise<PdfRuntimeReadiness> {
  try {
    const { PDFParse } = await loader();
    const parser = new PDFParse({ data: new Uint8Array() });
    await parser.destroy();
    return { status: "ready" };
  } catch {
    return { status: "degraded", code: "pdf_runtime_unavailable" };
  }
}
