import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Health = { ok: boolean; checks: Record<string, string> };

type ExperienceItem = {
  id: string;
  text: string;
  company: string;
  skillTags: string[];
  selected: boolean;
};
type ResumeData = {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  primaryTitle: string;
  specializations: [string, string];
  profile: string;
  keySkills: string[];
  education: string[];
  interests: string[];
  languages: string[];
  selectedExperience: ExperienceItem[];
  organization: string;
};
type ResumeSection = { id: SectionId; label: string; visible: boolean };
type SubmissionHistory = {
  id: string;
  date: string;
  role: string;
  company: string;
  jobLink: string;
  template: TemplateName;
  status: "active" | "churned";
  resume: ResumeData;
  coverLetter: string;
  jobDescription: string;
};

type PersistedSubmissionHistory = Omit<SubmissionHistory, "status"> & {
  status?: "active" | "churned";
};
type RequirementCheck = {
  id: string;
  requirement: string;
  score: number;
  reason: string;
};
type AgentOutputs = {
  job: Record<string, unknown>;
  company: Record<string, unknown>;
  candidate: Record<string, unknown>;
  draft: Record<string, unknown>;
  gap: Record<string, unknown>;
};
type LlmSettings = {
  enabled: boolean;
  provider: LlmProvider;
  apiKey: string;
  model: string;
  endpoint: string;
  organizationId: string;
  azureApiVersion: string;
  customHeaders: string;
type Snapshot = {
  run: any;
  steps: any[];
  artifacts: Array<{ type: string; data: any }>;
};

const agentLabels = ["JD Parser", "Experience Ingestion", "Actionable Points", "CV Builder"];

const initialResume: ResumeData = {
  fullName: "",
  email: "",
  phone: "",
  linkedin: "",
  portfolio: "",
  primaryTitle: "",
  specializations: ["", ""],
  profile: "",
  keySkills: [
    "Applied AI & Machine Learning",
    "React + TypeScript",
    "System Design",
  ],
  education: ["BSc, Computer Science, Your University"],
  interests: ["Product strategy", "Open source", "Mentoring"],
  languages: ["English — Fluent"],
  selectedExperience: [],
  organization: "",
};
const defaultLlmSettings: LlmSettings = {
  enabled: false,
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
  endpoint: "",
  organizationId: "",
  azureApiVersion: "2024-10-21",
  customHeaders: "",
};
const initialSections: ResumeSection[] = [
  { id: "header", label: "Header", visible: true },
  { id: "experience", label: "Experience", visible: true },
  { id: "profile", label: "Profile", visible: true },
  { id: "education", label: "Education", visible: true },
  { id: "skills", label: "Skills", visible: true },
  { id: "interests", label: "Interests", visible: true },
  { id: "languages", label: "Languages", visible: true },
];

function scoreClass(score: number) {
  if (score >= 75) return "score-good";
  if (score >= 45) return "score-warn";
  return "score-bad";
}

function App() {
  const normalizeHistoryItem = (
    item: PersistedSubmissionHistory,
  ): SubmissionHistory => ({
    ...item,
    status: item.status ?? "active",
  });
  const [tab, setTab] = useState<TabName>("resume");
  const [jobText, setJobText] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [experienceDoc, setExperienceDoc] = useState("");
  const [experienceItems, setExperienceItems] = useState<ExperienceItem[]>([]);
  const [resume, setResume] = useState<ResumeData>(initialResume);
  const [coverLetter, setCoverLetter] = useState("");
  const [coverLetterNotes, setCoverLetterNotes] = useState("");
  const [template, setTemplate] = useState<TemplateName>("Modern");
  const [history, setHistory] = useState<SubmissionHistory[]>(() =>
    (JSON.parse(localStorage.getItem("job-hunt-history") || "[]") as PersistedSubmissionHistory[]).map(
      normalizeHistoryItem,
    ),
  );
  const [companyFilter, setCompanyFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<string[]>([
    "Hi! I can help complete missing CV details.",
  ]);
  const [zoom, setZoom] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [editorDraft, setEditorDraft] = useState<ResumeData>(initialResume);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [tabsCollapsed, setTabsCollapsed] = useState(false);
  const [sectionListCollapsed, setSectionListCollapsed] = useState(false);
  const [sections, setSections] = useState<ResumeSection[]>(initialSections);
  const [requirementChecks, setRequirementChecks] = useState<
    RequirementCheck[]
  >([]);
  const [analyzingRequirements, setAnalyzingRequirements] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [previewPdfMode, setPreviewPdfMode] = useState(false);
  const [experiencePage, setExperiencePage] = useState(1);
  const [insightTab, setInsightTab] = useState<InsightTab>("soft");
  const [insightData, setInsightData] = useState<Record<InsightTab, string[]>>({
    soft: [],
    hard: [],
    reviews: [],
    salary: [],
    values: [],
  });
  const [agentOutputs, setAgentOutputs] = useState<AgentOutputs | null>(null);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(() => {
    const raw = localStorage.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultLlmSettings;
    try {
      return { ...defaultLlmSettings, ...JSON.parse(raw) };
    } catch {
      return defaultLlmSettings;
    }
  });
  const [saveMessage, setSaveMessage] = useState("");
  const previewRef = useRef<HTMLElement | null>(null);
  const previewResume = editMode ? editorDraft : resume;
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

  function parseExperience(raw: string) {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const chosen = lines
      .filter(
        (line) =>
          line.startsWith("-") ||
          line.startsWith("*") ||
          /^[0-9]+\./.test(line),
      )
      .map((line) => line.replace(/^[-*\d.\s]+/, ""));
    const parsed: ExperienceItem[] = (
      chosen.length ? chosen : lines.slice(0, 12)
    ).map((line) => {
      const company =
        line.match(/at\s+([A-Z][A-Za-z0-9&\s-]+)/)?.[1]?.trim() || "General";
      const skillTags = SKILL_KEYWORDS.filter((skill) =>
        line.toLowerCase().includes(skill),
      );
      return {
        id: uuidv4(),
        text: line,
        company,
        skillTags: skillTags.length ? skillTags : ["general"],
        selected: true,
      };
    });
    setExperienceItems(parsed);
    return parsed;
  }

  function extractPersonInfo(text: string) {
    return {
      email: text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "",
      phone: text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0] || "",
      fullName: (text.split("\n").find((line) => line.trim().length > 3) || "")
        .replace(/[^a-zA-Z\s'-]/g, "")
        .trim(),
    };
  }

  async function importJobFromUrl(link: string) {
    const normalizedLink = link.trim();
    if (!normalizedLink) return "";
    try {
      const res = await fetch("/api/jd/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedLink }),
      });
      if (!res.ok) throw new Error("Unable to import URL");
      const data = (await res.json()) as { jdText?: string };
      return (data.jdText || "").slice(0, 7000);
    } catch {
      setChatOpen(true);
      setChatMessages((prev) => [
        ...prev,
        "Could not import URL directly. Please paste the job description text.",
      ]);
      return "";
    }
  }

  function upsertHistory(jobDescription: string) {
    const normalizedJobDescription = jobDescription.trim();
    if (!normalizedJobDescription) return;

    setHistory((prev) => {
      const existingIndex = prev.findIndex(
        (entry) => entry.jobDescription.trim() === normalizedJobDescription,
      );
      const nextEntry: SubmissionHistory = {
        id: existingIndex >= 0 ? prev[existingIndex].id : uuidv4(),
        date: new Date().toISOString(),
        role: resume.primaryTitle,
        company: resume.organization,
        jobLink: jobLink.trim(),
        template,
        status: existingIndex >= 0 ? prev[existingIndex].status : "active",
        resume,
        coverLetter,
        jobDescription: normalizedJobDescription,
      };

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated.splice(existingIndex, 1);
        return [nextEntry, ...updated].slice(0, 30);
      }

      return [nextEntry, ...prev].slice(0, 30);
    });
  }

  async function runAgent1JobAnalyzer(jobDescription: string) {
    const llm = await callModel("jobAnalyzer", { jobDescription });
    if (llm) return llm;
    const hard = SKILL_KEYWORDS.filter((skill) =>
      jobDescription.toLowerCase().includes(skill),
    );
    return {
      hardSkills: hard,
      softSkills: ["communication", "collaboration"],
      mustHaves: hard.slice(0, 6),
      requirementsChecklist: hard.map((s) => `Experience with ${s}`),
      snapshot: { title: "Target Role" },
    };
  }

  async function runAgent2Scraper(jobDescription: string) {
    const llm = await callModel("scraper", {
      jobDescription,
      company: resume.organization,
    });
    if (llm) return llm;
    return {
      companyValues: ["Ownership", "Customer focus", "Bias for action"],
      employeeReviews: [
        "Fast-paced team with strong autonomy",
        "Lean processes and high accountability",
      ],
      salaryExpectations: ["Market range depends on location and seniority."],
      keywordInjection: [
        "ownership",
        "impact",
        "cross-functional",
        "scale",
        "execution",
      ],
    };
  }

  async function runAgent3Parser(documentText: string) {
    const llm = await callModel("experienceParser", { documentText });
    if (llm) return llm;
    return {
      parsedBullets: parseExperience(documentText).map((x) => x.text),
      technicalSkills: SKILL_KEYWORDS.filter((skill) =>
        documentText.toLowerCase().includes(skill),
      ),
    };
  }

  async function runAgent4Matcher(
    job: Record<string, unknown>,
    company: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ) {
    const llm = await callModel("matcher", { job, company, candidate });
    if (llm) return llm;
    return {
      summary: `Results-driven candidate aligned to ${(job.snapshot as { title?: string } | undefined)?.title || "target role"}.`,
      selectedSkills: ((job.mustHaves as string[] | undefined) || []).slice(
        0,
        10,
      ),
      tailoredExperience: (
        (candidate.parsedBullets as string[] | undefined) || []
      ).slice(0, 8),
    };
  }

  async function runAgent5Checker(
    job: Record<string, unknown>,
    draft: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ) {
    const llm = await callModel("gapAnalyst", { job, draft, candidate });
    if (llm) return llm;
    const reqs = (job.requirementsChecklist as string[] | undefined) || [];
    return {
      interviewQuestions: [
        "Can you quantify your most relevant project impact?",
        "Which missing tools have you used in adjacent contexts?",
      ],
      requirementScores: reqs.map((r) => ({
        requirement: r,
        score: Math.max(20, Math.round(Math.random() * 90)),
        reason: "Heuristic score.",
      })),
      criticalGaps: [
        "Add concrete metrics for ownership and leadership examples.",
      ],
    };
  }

  async function runAgent6Refiner(
    userAnswer: string,
    gap: Record<string, unknown>,
    draft: Record<string, unknown>,
  ) {
    const llm = await callModel("refiner", { userAnswer, gap, draft });
    if (llm) return llm;
    return {
      patchInstructions: [
        "Add quantified impact to recent role bullets.",
        "Add missing tool usage in skills matrix.",
      ],
    };
  }

  async function generateResume() {
    setAnalyzingRequirements(true);
    try {
      const importedText = jobLink.trim()
        ? await importJobFromUrl(jobLink)
        : "";
      const combinedJobText = [jobText, importedText]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      if (importedText && !jobText.includes(importedText)) {
        setJobText(combinedJobText);
      }
      const parsed = parseExperience(experienceDoc);
      const info = extractPersonInfo(experienceDoc);
      const organization =
        combinedJobText
          .match(/at\s+([A-Z][A-Za-z0-9&\s-]{2,})/i)?.[1]
          ?.trim() || "Target Company";
      const [job, company, candidate] = await Promise.all([
        runAgent1JobAnalyzer(combinedJobText),
        runAgent2Scraper(combinedJobText),
        runAgent3Parser(experienceDoc),
      ]);
      const draft = await runAgent4Matcher(job, company, candidate);
      const gap = await runAgent5Checker(job, draft, candidate);
      setAgentOutputs({ job, company, candidate, draft, gap });

      setResume({
        fullName: info.fullName || "Your Name",
        email: info.email,
        phone: info.phone,
        linkedin: "linkedin.com/in/your-profile",
        portfolio: "github.com/your-handle",
        primaryTitle: String(
          (draft.targetRole as string | undefined) ||
            (job.snapshot as { title?: string } | undefined)?.title ||
            "Target Role",
        ),
        specializations: ["Specialization 1", "Specialization 2"],
        profile: String(
          (draft.summary as string | undefined) ||
            "Tailored summary generated by matcher agent.",
        ),
        keySkills: (
          (draft.selectedSkills as string[] | undefined) ||
          (job.mustHaves as string[] | undefined) ||
          []
        ).slice(0, 12),
        education: ["BSc, Computer Science, Your University"],
        interests: ["Product strategy", "Open source", "Mentoring"],
        languages: ["English — Fluent"],
        selectedExperience: parsed.map((item, i) => ({
          ...item,
          text:
            ((draft.tailoredExperience as string[] | undefined) || [])[i] ||
            item.text,
        })),
        organization,
      });

      setRequirementChecks(
        (
          (gap.requirementScores as
            | { requirement: string; score: number; reason: string }[]
            | undefined) || []
        )
          .slice(0, 20)
          .map((x) => ({ id: uuidv4(), ...x })),
      );
      setInsightData({
        soft: ((job.softSkills as string[] | undefined) || []).slice(0, 8),
        hard: ((job.hardSkills as string[] | undefined) || []).slice(0, 10),
        reviews: (
          (company.employeeReviews as string[] | undefined) || []
        ).slice(0, 6),
        salary: (
          (company.salaryExpectations as string[] | undefined) || []
        ).slice(0, 4),
        values: ((company.companyValues as string[] | undefined) || []).slice(
          0,
          6,
        ),
      });

      setChatOpen(true);
      setChatMessages((prev) => [
        ...prev,
        "Agent 5 found potential gaps. Please answer the follow-up questions below.",
        ...((gap.interviewQuestions as string[] | undefined) || []).map(
          (q) => `• ${q}`,
        ),
      ]);
      upsertHistory(combinedJobText);
    } finally {
      setAnalyzingRequirements(false);
    }
  }

  async function runCheckerOnly() {
    if (!agentOutputs) return;
    setAnalyzingRequirements(true);
    try {
      const gap = await runAgent5Checker(
        agentOutputs.job,
        agentOutputs.draft,
        agentOutputs.candidate,
      );
      setRequirementChecks(
        (
          (gap.requirementScores as
            | { requirement: string; score: number; reason: string }[]
            | undefined) || []
        )
          .slice(0, 20)
          .map((x) => ({ id: uuidv4(), ...x })),
      );
      upsertHistory(jobText);
    } finally {
      setAnalyzingRequirements(false);
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

          {tab === "llmIntegration" && (
            <section className="llm-integration">
              <div className="llm-card">
                <div className="llm-header">
                  <h3>LLM Provider Settings</h3>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={llmSettings.enabled}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          enabled: e.target.checked,
                        }))
                      }
                    />{" "}
                    Enable integration
                  </label>
                </div>
                <p className="llm-subtitle">
                  Configure API settings for your provider. These values are
                  stored locally on this device.
                </p>
                <div className="llm-grid">
                  <label>
                    <span>Provider</span>
                    <select
                      value={llmSettings.provider}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          provider: e.target.value as LlmProvider,
                        }))
                      }
                    >
                      {(Object.keys(providerLabels) as LlmProvider[]).map(
                        (provider) => (
                          <option key={provider} value={provider}>
                            {providerLabels[provider]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Model</span>
                    <input
                      value={llmSettings.model}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          model: e.target.value,
                        }))
                      }
                      placeholder="Model name"
                    />
                  </label>
                  <label>
                    <span>API key / token</span>
                    <input
                      type="password"
                      value={llmSettings.apiKey}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          apiKey: e.target.value,
                        }))
                      }
                      placeholder="sk-..."
                    />
                  </label>
                  <label>
                    <span>Endpoint URL</span>
                    <input
                      value={llmSettings.endpoint}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          endpoint: e.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    <span>Organization / project (optional)</span>
                    <input
                      value={llmSettings.organizationId}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          organizationId: e.target.value,
                        }))
                      }
                      placeholder="org_..."
                    />
                  </label>
                  <label>
                    <span>Azure API version (optional)</span>
                    <input
                      value={llmSettings.azureApiVersion}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          azureApiVersion: e.target.value,
                        }))
                      }
                      placeholder="2024-10-21"
                    />
                  </label>
                  <label className="llm-full">
                    <span>Custom headers (optional, one per line)</span>
                    <textarea
                      value={llmSettings.customHeaders}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          customHeaders: e.target.value,
                        }))
                      }
                      placeholder="x-api-key: abc123"
                    />
                  </label>
                </div>
                <div className="llm-actions">
                  <button className="primary" onClick={saveLlmSettings}>
                    Save settings
                  </button>
                  {saveMessage && (
                    <p className="save-message" role="status">
                      {saveMessage}
                    </p>
                  )}
                </div>
              </div>
              <div className="llm-card">
                <h3>Provider hints</h3>
                <ul>
                  <li>
                    <strong>ChatGPT / OpenAI:</strong> keep endpoint empty to
                    use the default OpenAI chat completions URL.
                  </li>
                  <li>
                    <strong>Claude / Anthropic:</strong> set model to a Claude
                    Messages API model and provide your Anthropic token.
                  </li>
                  <li>
                    <strong>Copilot / Azure OpenAI:</strong> endpoint should be
                    your Azure deployment chat completions URL.
                  </li>
                  <li>
                    <strong>Gemini / Google AI:</strong> include a Gemini model
                    and API key/token.
                  </li>
                  <li>
                    <strong>Custom endpoint:</strong> enter endpoint/model and
                    optional custom headers.
                  </li>
                </ul>
              </div>
            </section>
          )}
          {tab === "coverLetter" && (
            <section className="cover-letter">
              <div>
                <h3>Notes to include</h3>
                <textarea
                  value={coverLetterNotes}
                  onChange={(e) => setCoverLetterNotes(e.target.value)}
                />
                <button className="primary" onClick={generateCoverLetter}>
                  Generate Cover Letter
                </button>
              </div>
              <div>
                <h3>Preview</h3>
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                />
              </div>
            </section>
          )}
          {tab === "history" && (
            <section className="history">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Role</th>
                    <th>Company</th>
                    <th>Role Link</th>
                    <th>Template</th>
                    <th>Status</th>
                    <th aria-label="Delete role" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr
                      key={item.id}
                      className={item.status === "churned" ? "history-row-churned" : ""}
                    >
                      <td>{new Date(item.date).toLocaleString()}</td>
                      <td>
                        <span
                          className={
                            item.status === "churned"
                              ? "history-role history-role-churned"
                              : "history-role"
                          }
                        >
                          {item.role}
                        </span>
                      </td>
                      <td>{item.company}</td>
                      <td>
                        {item.jobLink ? (
                          <a href={item.jobLink} target="_blank" rel="noreferrer">
                            Open role
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{item.template}</td>
                      <td>
                        <select
                          aria-label={`Set status for ${item.role}`}
                          className={`history-status ${
                            item.status === "churned" ? "history-status-churned" : ""
                          }`}
                          value={item.status}
                          onChange={(event) => {
                            const nextStatus = event.target.value as "active" | "churned";
                            setHistory((previous) =>
                              previous.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, status: nextStatus }
                                  : entry,
                              ),
                            );
                          }}
                        >
                          <option value="active">Active</option>
                          <option value="churned">Churned</option>
                        </select>
                      </td>
                      <td className="history-actions">
                        <button
                          type="button"
                          aria-label={`Delete ${item.role}`}
                          className="history-delete"
                          onClick={() =>
                            setHistory((previous) =>
                              previous.filter((entry) => entry.id !== item.id),
                            )
                          }
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      ))}

      <h3>CV Draft</h3>
      <pre>{JSON.stringify(cvDraft, null, 2)}</pre>
    </main>
  );
}
