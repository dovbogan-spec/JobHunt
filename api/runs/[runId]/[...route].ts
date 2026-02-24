import type { IncomingMessage, ServerResponse } from "http";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";
import { getIdempotencyKey, hashRequest, sendJson, readJson } from "../../_utils.js";
import { basicRateLimit } from "../../../server/orchestrator/rateLimit.js";
import { startRun, executeStep } from "../../../server/orchestrator/stepRunner.js";
import { getConfig } from "../../../server/config/edgeConfig.js";
import { putExportPdf, putExperienceFile } from "../../../server/storage/blob.js";
import {
  appendChat,
  completeIdempotencyKey,
  getRun,
  listEvents,
  reserveIdempotencyKey,
  saveExperienceUpload,
  updateRunStatus,
  upsertArtifacts,
} from "../../../server/storage/runsRepo.js";
import { clampExtractionText, extractExperienceText } from "../../../server/text/extract.js";
import { detectFileKind } from "../../../server/text/fileType.js";
import { parseSingleMultipartFile } from "../../../server/text/multipart.js";
import { chatSchema, runStepSchema } from "../../../shared/schemas/api.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 11 },
  heading: { fontSize: 18, marginBottom: 12 },
  section: { marginBottom: 8 },
});

function ResumePdf({ name, body }: { name: string; body: string }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.heading }, name),
      React.createElement(View, { style: styles.section }, React.createElement(Text, null, body)),
    ),
  );
}

function sanitizeCandidate(candidateName: string) {
  return candidateName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
}

function normalizeRoute(route: string | string[] | undefined) {
  if (!route) return "";
  return Array.isArray(route) ? route.join("/") : route;
}

export default async function handler(
  req: IncomingMessage & {
    method?: string;
    query?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
  },
  res: ServerResponse,
) {
  const runId = req.query?.runId;
  if (!runId || Array.isArray(runId)) return sendJson(res, 400, { error: "runId is required" });

  const route = normalizeRoute(req.query?.route);

  if (route === "") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    const snapshot = await getRun(runId);
    if (!snapshot.run) return sendJson(res, 404, { error: "Run not found" });
    return sendJson(res, 200, snapshot);
  }

  if (route === "start") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const idempotencyKey = getIdempotencyKey(req);
    const scope = `runs:start:${runId}`;

    if (idempotencyKey) {
      const reservation = await reserveIdempotencyKey({
        scope,
        key: idempotencyKey,
        requestHash: hashRequest({ runId, route: "start" }),
      });

      if (reservation.status === "mismatch") {
        return sendJson(res, 409, { error: "Idempotency key reuse with different request payload" });
      }
      if (reservation.status === "in_progress") {
        return sendJson(res, 409, { error: "A request with this idempotency key is already in progress" });
      }
      if (reservation.status === "replay") {
        res.setHeader("Idempotent-Replayed", "true");
        return sendJson(res, reservation.statusCode, reservation.response);
      }
    }

    const ip = req.socket?.remoteAddress || "unknown";
    if (!basicRateLimit(`start:${ip}`)) return sendJson(res, 429, { error: "Rate limit exceeded" });
    const result = await startRun(runId);

    if (idempotencyKey) {
      await completeIdempotencyKey({
        scope,
        key: idempotencyKey,
        statusCode: 200,
        response: result as Record<string, unknown>,
        runId,
      });
    }

    return sendJson(res, 200, result);
  }

  if (route === "step") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    const parsed = runStepSchema.safeParse(req.query || {});
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });
    const result = await executeStep(runId, parsed.data.index, parsed.data.force);
    return sendJson(res, 200, result);
  }

  if (route === "events") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    const events = await listEvents(runId);
    return sendJson(res, 200, { events });
  }

  if (route === "chat") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    const ip = req.socket?.remoteAddress || "unknown";
    if (!basicRateLimit(`chat:${ip}`)) return sendJson(res, 429, { error: "Rate limit exceeded" });

    const body = await readJson(req);
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.flatten() });

    await appendChat(runId, "user", parsed.data.message);
    const answer = "Thanks — I stored your message and queued assistant QA context.";
    await appendChat(runId, "assistant", answer);
    return sendJson(res, 200, { reply: answer });
  }

  if (route === "cancel") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    await updateRunStatus(runId, "cancelled");
    return sendJson(res, 200, { ok: true });
  }

  if (route === "upload") {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    try {
      const part = await parseSingleMultipartFile(req, "file");
      if (part.data.byteLength > MAX_UPLOAD_BYTES) {
        return sendJson(res, 413, { ok: false, error: `File too large. Max allowed is ${MAX_UPLOAD_BYTES} bytes.` });
      }
      const kind = detectFileKind(part.filename, part.contentType, part.data);
      if (!kind) {
        return sendJson(res, 400, { ok: false, error: "Unsupported file type. Use pdf/docx/txt." });
      }

      const uploaded = await putExperienceFile(runId, part.filename, part.data, part.contentType);
      const extracted = await extractExperienceText(part.filename, part.contentType, part.data);
      const experienceText = clampExtractionText(extracted.text);

      await saveExperienceUpload({
        runId,
        fileUrl: uploaded.url,
        filePathname: uploaded.pathname,
        experienceText,
      });

      return sendJson(res, 200, {
        ok: true,
        file: {
          url: uploaded.url,
          pathname: uploaded.pathname,
          contentType: uploaded.contentType ?? part.contentType,
          size: uploaded.size ?? part.data.byteLength,
        },
        extracted: { chars: experienceText.length, method: extracted.method, warnings: extracted.warnings },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      return sendJson(res, 400, { ok: false, error: message });
    }
  }

  if (route === "export/pdf") {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

    const snapshot = await getRun(runId);
    if (!snapshot.run) return sendJson(res, 404, { ok: false, error: "Run not found" });

    const config = await getConfig();
    const candidateName = snapshot.run.candidate_name || "Candidate";
    const safeCandidate = sanitizeCandidate(candidateName) || "Candidate";
    const fileName = `${safeCandidate}_CV.pdf`;

    const resumeDraft = snapshot.artifacts.find((row: { type: string }) => row.type === "resume_draft");
    const body = JSON.stringify(resumeDraft?.data ?? {}, null, 2).slice(0, 3000);
    const buffer = await renderToBuffer(React.createElement(ResumePdf, { name: candidateName, body }) as never);

    if (config.featureFlags.storeExportsInBlob) {
      const stored = await putExportPdf(runId, fileName, buffer, "application/pdf");
      await upsertArtifacts(runId, [
        {
          type: "resume_pdf",
          data: {
            fileName,
            url: stored.url,
            pathname: stored.pathname,
            size: stored.size,
            storedAt: new Date().toISOString(),
          },
        },
      ]);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.end(buffer);
  }

  return sendJson(res, 404, { error: "Not found" });
}
