import { createPdfBuffer } from "../test/helpers/fixtures.js";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:5173";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Request failed ${path}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function uploadExperience(runId: string) {
  const file = createPdfBuffer();
  const form = new FormData();
  form.append("file", new Blob([file], { type: "application/pdf" }), "sample.pdf");

  return jsonFetch(`/api/runs/${runId}/upload`, { method: "POST", body: form });
}

async function pollUntilSucceeded(runId: string) {
  for (let i = 0; i < 20; i += 1) {
    const snapshot = await jsonFetch(`/api/runs/${runId}`);
    if (snapshot.run?.status === "succeeded") return snapshot;
    if (snapshot.run?.status === "failed") throw new Error("Run failed");
    await wait(1000);
  }
  throw new Error("Run did not finish in time");
}

async function main() {
  const run = await jsonFetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Smoke run",
      jdSourceType: "paste",
      jdText: "Senior TypeScript engineer role focused on API reliability and orchestration.",
      candidateName: "Smoke Tester",
    }),
  });

  const runId = run.runId as string;
  if (!runId) throw new Error("runId missing");

  const upload = await uploadExperience(runId);
  if (!upload.ok) throw new Error("Upload failed");

  await jsonFetch(`/api/runs/${runId}/start`, { method: "POST" });
  const snapshot = await pollUntilSucceeded(runId);

  const types = new Set((snapshot.artifacts || []).map((artifact: { type: string }) => artifact.type));
  for (const required of ["parsed_experience", "tagged_bullets", "resume_draft"]) {
    if (!types.has(required)) throw new Error(`Missing artifact: ${required}`);
  }

  const pdfResponse = await fetch(`${baseUrl}/api/runs/${runId}/export/pdf`, { method: "POST" });
  if (!pdfResponse.ok) throw new Error("PDF export failed");
  if (!pdfResponse.headers.get("content-type")?.includes("application/pdf")) {
    throw new Error("PDF export content-type mismatch");
  }

  console.log(JSON.stringify({ ok: true, runId }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
