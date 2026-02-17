import { createPdfBuffer } from "../test/helpers/fixtures.js";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:5173";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jsonFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function main() {
  const run = await jsonFetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Smoke", candidateName: "Smoke", jdSourceType: "paste", jdText: "Need React TypeScript AWS leadership" }),
  });
  const runId = run.runId as string;

  const form = new FormData();
  form.append("file", new Blob([createPdfBuffer()], { type: "application/pdf" }), "sample.pdf");
  await jsonFetch(`/api/runs/${runId}/upload`, { method: "POST", body: form });

  for (let i = 1; i <= 4; i += 1) await jsonFetch(`/api/runs/${runId}/step?index=${i}`, { method: "POST" });

  let snapshot = await jsonFetch(`/api/runs/${runId}`);
  const artifactTypes = new Set(snapshot.artifacts.map((a: any) => a.type));
  ["parsed_jd", "parsed_experience", "actionable_points", "cv_draft", "skill_scores"].forEach((t) => {
    if (!artifactTypes.has(t)) throw new Error(`Missing artifact ${t}`);
  });

  const firstWeak = snapshot.artifacts.find((a: any) => a.type === "skill_scores")?.data?.scores?.find((s: any) => s.status !== "covered");
  if (firstWeak) {
    await jsonFetch(`/api/runs/${runId}/skills/${encodeURIComponent(firstWeak.skillTag)}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: `I used ${firstWeak.skillTag} in production.` }),
    });
  }

  await wait(200);
  snapshot = await jsonFetch(`/api/runs/${runId}`);
  if (!snapshot.artifacts.find((a: any) => a.type === "cv_revisions")) throw new Error("cv_revisions missing");
  console.log(JSON.stringify({ ok: true, runId }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
