import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectFileKind } from "../server/text/fileType.js";
import { extractExperienceText } from "../server/text/extract.js";
import { createDocxBuffer, createPdfBuffer, EXPECTED_PHRASE } from "./helpers/fixtures.js";

test("detectFileKind and extract plain text safely", async () => {
  const bytes = await readFile(new URL("./fixtures/sample.txt", import.meta.url));
  const kind = detectFileKind("sample.txt", "text/plain", bytes);
  assert.equal(kind, "txt");

  const extracted = await extractExperienceText("sample.txt", "text/plain", bytes);
  assert.match(extracted.text, /Experienced software engineer/);
  assert.ok(!extracted.text.includes("\uFFFD"));
});

test("extract pdf fixture without garbled output", async () => {
  const bytes = createPdfBuffer();
  const kind = detectFileKind("sample.pdf", "application/pdf", bytes);
  assert.equal(kind, "pdf");

  const extracted = await extractExperienceText("sample.pdf", "application/pdf", bytes);
  assert.match(extracted.text, new RegExp(EXPECTED_PHRASE));
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(extracted.text));
});

test("extract docx fixture without garbled output", async () => {
  const bytes = await createDocxBuffer();
  const kind = detectFileKind("sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes);
  assert.equal(kind, "docx");

  const extracted = await extractExperienceText("sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes);
  assert.match(extracted.text, new RegExp(EXPECTED_PHRASE));
  assert.ok(!extracted.text.includes("\uFFFD"));
});
