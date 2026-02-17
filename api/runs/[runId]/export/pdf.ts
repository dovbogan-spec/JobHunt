import type { IncomingMessage, ServerResponse } from "http";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";
import { getConfig } from "../../../../server/config/edgeConfig";
import { putExportPdf } from "../../../../server/storage/blob";
import { getRun, upsertArtifacts } from "../../../../server/storage/runsRepo";
import { getRun } from "../../../../server/storage/runsRepo.js";

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

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  }

  const runId = req.query?.runId;
  if (!runId) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: "runId is required" }));
  }

  const snapshot = await getRun(runId);
  if (!snapshot.run) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: "Run not found" }));
  }

  const config = await getConfig();
  const candidateName = snapshot.run.candidate_name || "Candidate";
  const safeCandidate = sanitizeCandidate(candidateName) || "Candidate";
  const fileName = `${safeCandidate}_CV.pdf`;

  const resumeDraft = snapshot.artifacts.find((row: { type: string }) => row.type === "resume_draft");
  const body = JSON.stringify(resumeDraft?.data ?? {}, null, 2).slice(0, 3000);

  const buffer = await renderToBuffer(React.createElement(ResumePdf, { name: candidateName, body }));

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

  const buffer = await renderToBuffer(React.createElement(ResumePdf, { name: candidateName, body }) as never);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.end(buffer);
}
