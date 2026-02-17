import { Buffer } from "node:buffer";
import { ZipFile } from "yazl";

export const EXPECTED_PHRASE = "Experienced software engineer with 8 years building TypeScript and distributed systems.";

export async function createDocxBuffer(text = EXPECTED_PHRASE): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();

    zip.addBuffer(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
      "[Content_Types].xml",
    );

    zip.addBuffer(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
      "_rels/.rels",
    );

    zip.addBuffer(
      Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`),
      "word/document.xml",
    );

    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    zip.outputStream.on("error", reject);
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.end();
  });
}

export function createPdfBuffer(text = EXPECTED_PHRASE): Buffer {
  const escaped = text.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 120 >> stream
BT
/F1 12 Tf
72 720 Td
(${escaped}) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000253 00000 n 
0000000427 00000 n 
trailer << /Root 1 0 R /Size 6 >>
startxref
497
%%EOF
`, "latin1");
}
