import type { IncomingMessage } from "http";

type ParsedMultipartFile = {
  filename: string;
  contentType: string;
  data: Buffer;
};

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function parseSingleMultipartFile(req: IncomingMessage, fieldName = "file"): Promise<ParsedMultipartFile> {
  const contentTypeHeader = req.headers["content-type"] || "";
  const match = contentTypeHeader.match(/boundary=(.+)$/);
  if (!match) throw new Error("Missing multipart boundary");

  const boundary = match[1].trim().replace(/^"|"$/g, "");
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const body = await readBody(req);

  let cursor = 0;
  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(boundaryBuffer, cursor);
    if (boundaryIndex === -1) break;

    const partStart = boundaryIndex + boundaryBuffer.length + 2;
    const nextBoundaryIndex = body.indexOf(boundaryBuffer, partStart);
    if (nextBoundaryIndex === -1) break;

    const part = body.subarray(partStart, nextBoundaryIndex - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      cursor = nextBoundaryIndex;
      continue;
    }

    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const bodyBytes = part.subarray(headerEnd + 4);

    const disposition = headerText.match(/content-disposition: form-data;([^\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];

    if (name === fieldName && filename) {
      const partContentType =
        headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
      return {
        filename,
        contentType: partContentType,
        data: bodyBytes,
      };
    }

    cursor = nextBoundaryIndex;
  }

  throw new Error(`Missing multipart file field: ${fieldName}`);
}
