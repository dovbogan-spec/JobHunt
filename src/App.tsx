import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Health = { ok: boolean; checks: Record<string, string> };

type Snapshot = {
  run: any;
  steps: any[];
  artifacts: Array<{ type: string; data: any }>;
};

const agentLabels = ["JD Parser", "Experience Ingestion", "Actionable Points", "CV Builder"];

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [title, setTitle] = useState("My run");
  const [candidateName, setCandidateName] = useState("Candidate");
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [runId, setRunId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [runningStep, setRunningStep] = useState<number | null>(null);
  const [skillChat, setSkillChat] = useState<Record<string, string>>({});

  const scores = useMemo(() => snapshot?.artifacts.find((a) => a.type === "skill_scores")?.data?.scores || [], [snapshot]);
  const cvDraft = snapshot?.artifacts.find((a) => a.type === "cv_draft")?.data;

  async function refresh(id = runId) {
    if (!id) return;
    const res = await fetch(`/api/runs/${id}`);
    if (res.ok) setSnapshot(await res.json());
  }

  useEffect(() => {
    const poll = async () => {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
    };
    poll();
  }, []);

  async function importJd() {
    const res = await fetch("/api/jd/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: jdUrl || undefined, text: jdText || undefined }) });
    const data = await res.json();
    if (res.ok) setJdText(data.jdText);
  }

  async function createRun() {
    const res = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, candidateName, jdSourceType: jdUrl ? "url" : "paste", jdSourceUrl: jdUrl || undefined, jdText }) });
    const data = await res.json();
    if (res.ok) {
      setRunId(data.runId);
      await refresh(data.runId);
    }
  }

  async function upload(file: File) {
    if (!runId) return;
    const form = new FormData();
    form.append("file", file);
    await fetch(`/api/runs/${runId}/upload`, { method: "POST", body: form });
    await refresh();
  }

  async function runStep(index: number) {
    if (!runId || runningStep) return;
    setRunningStep(index);
    await fetch(`/api/runs/${runId}/step?index=${index}`, { method: "POST" });
    setRunningStep(null);
    await refresh();
  }

  async function improveSkill(skillTag: string) {
    const message = skillChat[skillTag];
    if (!message || !runId) return;
    await fetch(`/api/runs/${runId}/skills/${encodeURIComponent(skillTag)}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    setSkillChat((s) => ({ ...s, [skillTag]: "" }));
    await refresh();
  }

  return (
    <main style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h2>JobHunt Orchestrator</h2>
      <button style={{ background: health?.ok ? "#1f9d55" : "#999", color: "#fff", border: 0, padding: "6px 10px", borderRadius: 8 }}>
        LLM API: {health?.ok ? "Connected" : "Unavailable"}
      </button>
      <p>{health?.checks?.openai}</p>

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Run title" />
      <input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Candidate" />
      <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste JD text" rows={5} />
      <input value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} placeholder="Or JD URL" />
      <div><button onClick={importJd}>Import JD</button><button onClick={createRun}>Create Run</button></div>

      <p>Run: {runId}</p>
      <input type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

      <h3>Agents</h3>
      {agentLabels.map((label, i) => (
        <button key={label} disabled={Boolean(runningStep)} onClick={() => runStep(i + 1)}>
          {runningStep === i + 1 ? `Running ${label}...` : `Run ${i + 1}: ${label}`}
        </button>
      ))}

      <h3>Skill Coverage</h3>
      {scores.map((s: any) => (
        <div key={s.skillTag} style={{ border: "1px solid #ddd", marginBottom: 8, padding: 8 }}>
          <strong>{s.skillTag}</strong> ({s.status})
          {(s.status === "missing" || s.status === "weak") && (
            <>
              <input value={skillChat[s.skillTag] || ""} onChange={(e) => setSkillChat((x) => ({ ...x, [s.skillTag]: e.target.value }))} placeholder={`Evidence for ${s.skillTag}`} />
              <button onClick={() => improveSkill(s.skillTag)}>Improve this skill</button>
            </>
          )}
        </div>
      ))}

      <h3>CV Draft</h3>
      <pre>{JSON.stringify(cvDraft, null, 2)}</pre>
    </main>
  );
}
