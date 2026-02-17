import type { IncomingMessage, ServerResponse } from "http";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";
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

  const candidateName = snapshot.run.candidate_name || "Candidate";
  const resumeDraft = snapshot.artifacts.find((row: { type: string }) => row.type === "resume_draft");
  const body = JSON.stringify(resumeDraft?.data ?? {}, null, 2).slice(0, 3000);

  const buffer = await renderToBuffer(React.createElement(ResumePdf, { name: candidateName, body }) as never);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${candidateName.replace(/\s+/g, "_")}_CV.pdf"`);
  res.end(buffer);
}
