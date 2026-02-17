import type { IncomingMessage, ServerResponse } from "http";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";
import { getRun } from "../../../../server/storage/runsRepo";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 11 },
  heading: { fontSize: 18, marginBottom: 12 },
  section: { marginBottom: 8 },
});

function ResumePdf({ name, body }: { name: string; body: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.heading}>{name}</Text>
        <View style={styles.section}>
          <Text>{body}</Text>
        </View>
      </Page>
    </Document>
  );
}

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const runId = req.query?.runId;
  if (!runId) {
    res.statusCode = 400;
    return res.end("runId is required");
  }

  const snapshot = await getRun(runId);
  if (!snapshot.run) {
    res.statusCode = 404;
    return res.end("Run not found");
  }

  const candidateName = snapshot.run.candidate_name || "Candidate";
  const resumeDraft = snapshot.artifacts.find((row: { type: string }) => row.type === "resume_draft");
  const body = JSON.stringify(resumeDraft?.data ?? {}, null, 2).slice(0, 3000);

  const buffer = await renderToBuffer(<ResumePdf name={candidateName} body={body} />);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${candidateName.replace(/\s+/g, "_")}_CV.pdf"`);
  res.end(buffer);
}
