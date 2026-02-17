import type { IncomingMessage, ServerResponse } from "http";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";
import { sendJson, readJson } from "../../_utils.js";
import { startRun, executeStep } from "../../../server/orchestrator/stepRunner.js";
import { putExportPdf, putExperienceFile } from "../../../server/storage/blob.js";
import { appendChat, getRun, listEvents, saveExperienceUpload, updateRunStatus, upsertArtifacts } from "../../../server/storage/runsRepo.js";
import { clampExtractionText, extractExperienceText } from "../../../server/text/extract.js";
import { detectFileKind } from "../../../server/text/fileType.js";
import { parseSingleMultipartFile } from "../../../server/text/multipart.js";
import { chatSchema, runStepSchema } from "../../../shared/schemas/api.js";
import { skillChatSchema } from "../../../shared/schemas/contracts.js";
import { generateText } from "../../../server/llm/openai.js";
import { newRevisionId } from "../../../server/agents/index.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const styles = StyleSheet.create({ page: { padding: 24, fontSize: 11 }, heading: { fontSize: 18, marginBottom: 12 }, section: { marginBottom: 8 } });
const ResumePdf = ({ name, body }: { name: string; body: string }) => React.createElement(Document, null, React.createElement(Page, { size: "A4", style: styles.page }, React.createElement(Text, { style: styles.heading }, name), React.createElement(View, { style: styles.section }, React.createElement(Text, null, body))));
const normalizeRoute = (route: string | string[] | undefined) => (!route ? "" : Array.isArray(route) ? route.join("/") : route);

export default async function handler(req: IncomingMessage & { method?: string; query?: Record<string, string | string[] | undefined> }, res: ServerResponse) {
  const runId = req.query?.runId;
  if (!runId || Array.isArray(runId)) return sendJson(res, 400, { error: "runId is required" });
  const route = normalizeRoute(req.query?.route);

  if (route === "") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    const snapshot = await getRun(runId);
    if (!snapshot.run) return sendJson(res, 404, { error: "Run not found" });
    return sendJson(res, 200, snapshot);
  }
  if (route === "start" && req.method === "POST") return sendJson(res, 200, await startRun(runId));
  if (route === "step" && req.method === "POST") {
    const parsed = runStepSchema.safeParse(req.query || {});
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });
    return sendJson(res, 200, await executeStep(runId, parsed.data.index, parsed.data.force));
  }
  if (route === "events" && req.method === "GET") return sendJson(res, 200, { events: await listEvents(runId) });

  if (route === "chat") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    const parsed = chatSchema.safeParse(await readJson(req));
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });
    await appendChat(runId, "user", parsed.data.message);
    const reply = "Thanks — message stored.";
    await appendChat(runId, "assistant", reply);
    return sendJson(res, 200, { reply });
  }

  const skillMatch = route.match(/^skills\/([^/]+)\/chat$/);
  if (skillMatch) {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    const skillTag = decodeURIComponent(skillMatch[1]);
    const parsed = skillChatSchema.safeParse(await readJson(req));
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });

    const snapshot = await getRun(runId);
    const cvDraftRow = snapshot.artifacts.find((a: any) => a.type === "cv_draft");
    if (!cvDraftRow) return sendJson(res, 400, { error: "cv_draft not available" });

    let suggestion = `Add a bullet showing ${skillTag} with measurable impact.`;
    if (process.env.OPENAI_API_KEY) {
      try {
        suggestion = (await generateText("You improve CV bullets.", `Skill:${skillTag}\nUser:${parsed.data.message}`)).slice(0, 500) || suggestion;
      } catch {
        // keep deterministic fallback
      }
    }

    const cvDraft = cvDraftRow.data as any;
    const experience = cvDraft.sections?.find((s: any) => s.key === "experience");
    if (experience) experience.items = [suggestion, ...(experience.items || [])].slice(0, 12);
    cvDraft.updatedAt = new Date().toISOString();

    const revision = { revisionId: newRevisionId(), skillTag, userPrompt: parsed.data.message, assistantResponse: suggestion, updatedAt: new Date().toISOString() };
    const existingRevisions = snapshot.artifacts.find((a: any) => a.type === "cv_revisions")?.data?.revisions || [];

    await upsertArtifacts(runId, [
      { type: "cv_draft", data: cvDraft },
      { type: "cv_revisions", data: { revisions: [...existingRevisions, revision] } },
    ]);
    await appendChat(runId, "user", `[${skillTag}] ${parsed.data.message}`);
    await appendChat(runId, "assistant", suggestion);
    return sendJson(res, 200, { ok: true, revision, cvDraft });
  }

  if (route === "cancel" && req.method === "POST") {
    await updateRunStatus(runId, "cancelled");
    return sendJson(res, 200, { ok: true });
  }

  if (route === "upload") {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    try {
      const part = await parseSingleMultipartFile(req, "file");
      if (part.data.byteLength > MAX_UPLOAD_BYTES) return sendJson(res, 413, { ok: false, error: "File too large" });
      const kind = detectFileKind(part.filename, part.contentType, part.data);
      if (!kind) return sendJson(res, 400, { ok: false, error: "Unsupported file type" });
      const uploaded = await putExperienceFile(runId, part.filename, part.data, part.contentType);
      const extracted = await extractExperienceText(part.filename, part.contentType, part.data);
      const experienceText = clampExtractionText(extracted.text);
      await saveExperienceUpload({ runId, fileUrl: uploaded.url, filePathname: uploaded.pathname, experienceText });
      return sendJson(res, 200, { ok: true, file: uploaded, extracted: { chars: experienceText.length, method: extracted.method, warnings: extracted.warnings } });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "upload failed" });
    }
  }

  if (route === "export/pdf" && req.method === "POST") {
    const snapshot = await getRun(runId);
    if (!snapshot.run) return sendJson(res, 404, { ok: false, error: "Run not found" });
    const resumeDraft = snapshot.artifacts.find((row: any) => row.type === "cv_draft");
    const candidateName = snapshot.run.candidate_name || "Candidate";
    const body = JSON.stringify(resumeDraft?.data ?? {}, null, 2).slice(0, 3000);
    const buffer = await renderToBuffer(React.createElement(ResumePdf, { name: candidateName, body }) as never);
    await putExportPdf(runId, `${candidateName}_CV.pdf`, buffer, "application/pdf");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    return res.end(buffer);
  }

  return sendJson(res, 404, { error: "Not found" });
}
