import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";
import { AGENT_PROMPTS, type AgentPromptId } from "./agentPrompts";
import "./App.css";

type TemplateName = "Modern" | "Classic" | "Technical" | "Professional";
type TabName = "resume" | "coverLetter" | "history" | "llmIntegration";
type SectionId =
  | "header"
  | "experience"
  | "profile"
  | "education"
  | "skills"
  | "interests"
  | "languages";
type InsightTab = "soft" | "hard" | "reviews" | "salary" | "values";
type LlmProvider = "openai" | "anthropic" | "azureOpenai" | "gemini" | "custom";

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
  resume: ResumeData;
  coverLetter: string;
  jobDescription: string;
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
};

const SKILL_KEYWORDS = [
  "react",
  "typescript",
  "javascript",
  "python",
  "java",
  "aws",
  "docker",
  "kubernetes",
  "sql",
  "data",
  "product",
  "api",
  "node",
  "leadership",
  "agile",
  "communication",
  "design",
  "testing",
  "ci/cd",
];
const EXPERIENCE_PAGE_SIZE = 10;
const INSIGHT_TABS: InsightTab[] = [
  "soft",
  "hard",
  "reviews",
  "salary",
  "values",
];
const INSIGHT_TAB_LABELS: Record<InsightTab, string> = {
  soft: "Soft Skills",
  hard: "Hard Skills",
  reviews: "Reviews",
  salary: "Salary",
  values: "Values",
};
const INSIGHT_TAB_ICONS: Record<InsightTab, string> = {
  soft: "🤝",
  hard: "🧠",
  reviews: "⭐",
  salary: "💰",
  values: "🌱",
};
const TEMPLATES: TemplateName[] = [
  "Modern",
  "Classic",
  "Technical",
  "Professional",
];
const LLM_SETTINGS_STORAGE_KEY = "job-hunt-llm-settings";
const providerLabels: Record<LlmProvider, string> = {
  openai: "ChatGPT / OpenAI",
  anthropic: "Claude / Anthropic",
  azureOpenai: "Copilot / Azure OpenAI",
  gemini: "Gemini / Google AI",
  custom: "Custom endpoint",
};

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
    JSON.parse(localStorage.getItem("job-hunt-history") || "[]"),
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

  useEffect(
    () => localStorage.setItem("job-hunt-history", JSON.stringify(history)),
    [history],
  );
  useEffect(() => {
    localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(llmSettings));
  }, [llmSettings]);
  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);
  useEffect(() => {
    const onFullscreenChange = () =>
      setPreviewFullscreen(
        Boolean(
          document.fullscreenElement &&
          document.fullscreenElement === previewRef.current,
        ),
      );
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const companies = useMemo(
    () => [
      "all",
      ...Array.from(new Set(experienceItems.map((item) => item.company))),
    ],
    [experienceItems],
  );
  const skills = useMemo(
    () => [
      "all",
      ...Array.from(new Set(experienceItems.flatMap((item) => item.skillTags))),
    ],
    [experienceItems],
  );
  const filteredExperience = useMemo(
    () =>
      experienceItems.filter(
        (item) =>
          (companyFilter === "all" || item.company === companyFilter) &&
          (skillFilter === "all" || item.skillTags.includes(skillFilter)),
      ),
    [experienceItems, companyFilter, skillFilter],
  );
  const totalExperiencePages = Math.max(
    1,
    Math.ceil(filteredExperience.length / EXPERIENCE_PAGE_SIZE),
  );
  const paginatedExperience = useMemo(() => {
    const startIndex = (experiencePage - 1) * EXPERIENCE_PAGE_SIZE;
    return filteredExperience.slice(
      startIndex,
      startIndex + EXPERIENCE_PAGE_SIZE,
    );
  }, [experiencePage, filteredExperience]);
  useEffect(() => {
    setExperiencePage(1);
  }, [companyFilter, skillFilter, experienceItems.length]);

  function getLlmConnectionInfo(settings: LlmSettings) {
    const providerDefaults: Record<
      LlmProvider,
      { endpoint: string; model: string }
    > = {
      openai: {
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
      },
      anthropic: {
        endpoint: "https://api.anthropic.com/v1/messages",
        model: "claude-3-5-sonnet-latest",
      },
      azureOpenai: { endpoint: "", model: "gpt-4o-mini" },
      gemini: {
        endpoint:
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-1.5-pro",
      },
      custom: { endpoint: "", model: "" },
    };
    const providerDefault = providerDefaults[settings.provider];
    const endpoint = settings.endpoint.trim() || providerDefault.endpoint;
    const model = settings.model.trim() || providerDefault.model;
    return { endpoint, model };
  }

  function saveLlmSettings() {
    localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(llmSettings));
    setSaveMessage("LLM integration settings saved.");
  }

  async function callModel(
    agent: AgentPromptId,
    payload: Record<string, unknown>,
  ) {
    const configured = llmSettings.enabled
      ? getLlmConnectionInfo(llmSettings)
      : null;
    const apiUrl = configured?.endpoint || import.meta.env.VITE_LLM_API_URL;
    const model =
      configured?.model || import.meta.env.VITE_LLM_MODEL || "gpt-4o-mini";
    const key = llmSettings.enabled
      ? llmSettings.apiKey.trim()
      : import.meta.env.VITE_LLM_API_KEY;
    if (!apiUrl) return null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (llmSettings.enabled && llmSettings.organizationId.trim())
      headers["OpenAI-Organization"] = llmSettings.organizationId.trim();

    if (llmSettings.enabled && llmSettings.customHeaders.trim()) {
      llmSettings.customHeaders.split("\n").forEach((line) => {
        const [headerName, ...valueParts] = line.split(":");
        if (!headerName || valueParts.length === 0) return;
        headers[headerName.trim()] = valueParts.join(":").trim();
      });
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: AGENT_PROMPTS[agent] },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.2,
    };

    if (
      llmSettings.enabled &&
      llmSettings.provider === "azureOpenai" &&
      llmSettings.azureApiVersion.trim()
    ) {
      requestBody.apiVersion = llmSettings.azureApiVersion.trim();
    }

    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) throw new Error(`Agent ${agent} failed`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
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
    }
  }

  async function submitGapAnswer() {
    if (!chatInput.trim() || !agentOutputs) return;
    const answer = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, `You: ${answer}`]);
    const patch = await runAgent6Refiner(
      answer,
      agentOutputs.gap,
      agentOutputs.draft,
    );
    const patchedDraft = await runAgent4Matcher(
      agentOutputs.job,
      agentOutputs.company,
      { ...agentOutputs.candidate, patch },
    );
    setResume((prev) => ({
      ...prev,
      profile: String(
        (patchedDraft.summary as string | undefined) || prev.profile,
      ),
      keySkills: (
        (patchedDraft.selectedSkills as string[] | undefined) || prev.keySkills
      ).slice(0, 12),
    }));
    setChatMessages((prev) => [
      ...prev,
      "Agent 6 integrated your context and sent an update back to Agent 4. CV has been refreshed.",
    ]);
  }

  function applySelectedExperience() {
    setResume((prev) => ({
      ...prev,
      selectedExperience: experienceItems.filter((item) => item.selected),
    }));
  }
  function toggleExperience(id: string) {
    setExperienceItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  }
  function toggleSection(id: SectionId) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, visible: !section.visible } : section,
      ),
    );
  }
  function updateSectionLabel(id: SectionId, label: string) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, label } : section,
      ),
    );
  }
  function moveSection(id: SectionId, direction: "up" | "down") {
    setSections((prev) => {
      const currentIndex = prev.findIndex((section) => section.id === id);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
      return next;
    });
  }
  function startEditingResume() {
    setEditorDraft({ ...resume, selectedExperience: [...resume.selectedExperience] });
    setEditMode(true);
  }
  function saveEditingResume() {
    setResume(editorDraft);
    setEditMode(false);
    setSaveMessage("Resume edits saved.");
  }
  function cancelEditingResume() {
    setEditorDraft(resume);
    setEditMode(false);
  }
  function moveBullet(index: number, direction: "up" | "down") {
    setEditorDraft((prev) => {
      const next = [...prev.selectedExperience];
      const t = direction === "up" ? index - 1 : index + 1;
      if (t < 0 || t >= next.length) return prev;
      [next[index], next[t]] = [next[t], next[index]];
      return { ...prev, selectedExperience: next };
    });
  }
  async function togglePreviewFullscreen() {
    if (!previewRef.current) return;
    if (!document.fullscreenElement)
      return previewRef.current.requestFullscreen();
    if (document.fullscreenElement === previewRef.current)
      return document.exitFullscreen();
  }

  function toPlainText(value: string) {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function generateCoverLetter() {
    setCoverLetter(
      `Dear Hiring Team at ${resume.organization || "the company"},\n\nI am excited to apply for the ${resume.primaryTitle || "open role"}. I bring strengths in ${resume.keySkills.slice(0, 5).join(", ")} and have delivered:\n${resume.selectedExperience
        .slice(0, 3)
        .map((item) => `• ${toPlainText(item.text)}`)
        .join(
          "\n",
        )}\n\n${coverLetterNotes ? `${coverLetterNotes}\n\n` : ""}Sincerely,\n${resume.fullName || "Candidate"}`,
    );
  }

  function downloadResumePdf() {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text(resume.fullName || "Your Name", 14, y);
    y += 8;
    doc.setFontSize(11);
    doc.text(`${resume.email} | ${resume.phone} | ${resume.linkedin}`, 14, y);
    y += 8;
    doc.text(`Target Role: ${resume.primaryTitle}`, 14, y);
    y += 8;
    doc.text(toPlainText(resume.profile), 14, y, { maxWidth: 180 });
    y += 16;
    doc.text(`Skills: ${resume.keySkills.join(", ")}`, 14, y, {
      maxWidth: 180,
    });
    y += 12;
    resume.selectedExperience.forEach((item) => {
      doc.text(`• ${toPlainText(item.text)}`, 14, y, { maxWidth: 180 });
      y += 7;
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
    });
    doc.save(`${(resume.fullName || "resume").replace(/\s+/g, "_")}.pdf`);
  }

  async function onUpload(file: File) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/experience/parse", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        extracted?: { text?: string };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not extract file text");
      }

      setExperienceDoc(payload.extracted?.text || "");
    } catch {
      setChatOpen(true);
      setChatMessages((prev) => [
        ...prev,
        "Could not extract text from that file. Please upload pdf/docx/txt/md or paste plain text.",
      ]);
    }
  }

  return (
    <div className={`shell ${chatOpen ? "chat-expanded" : "chat-collapsed"}`}>
      <header className="header">
        <h1>🌿 Job Hunter</h1>
        <div className="header-actions">
          <button
            className={`small-action ${tab === "llmIntegration" ? "active" : ""}`}
            onClick={() => setTab("llmIntegration")}
          >
            🤖 LLM API
          </button>
          <button className="small-action" onClick={downloadResumePdf}>
            📥 Download PDF
          </button>
          <button
            className={`small-action ${chatOpen ? "active" : ""}`}
            onClick={() => setChatOpen((v) => !v)}
          >
            {chatOpen ? "🧩 Hide Chat" : "💬 Show Chat"}
          </button>
        </div>
      </header>
      <div className="app-layout">
        <div className="main-content">
          <div className="tabs-header">
            <button
              className="icon-toggle-btn"
              onClick={() => setTabsCollapsed((prev) => !prev)}
              title={tabsCollapsed ? "Open tabs" : "Collapse tabs"}
              aria-label={tabsCollapsed ? "Open tabs" : "Collapse tabs"}
            >
              ☰
            </button>
          </div>
          {!tabsCollapsed && (
            <nav className="tabs">
              <button
                className={tab === "resume" ? "active" : ""}
                onClick={() => setTab("resume")}
              >
                📝 Resume Builder
              </button>
              <button
                className={tab === "coverLetter" ? "active" : ""}
                onClick={() => setTab("coverLetter")}
              >
                ✉️ Cover Letter
              </button>
              <button
                className={tab === "history" ? "active" : ""}
                onClick={() => setTab("history")}
              >
                📚 Submission History
              </button>
            </nav>
          )}

          {tab === "resume" && (
            <>
              <section className="intake">
                <textarea
                  placeholder="📄 Paste the job description here"
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                />
                <div className="intake-right">
                  <input
                    value={jobLink}
                    onChange={(e) => setJobLink(e.target.value)}
                    placeholder="🔗 Or paste job link"
                  />
                  <input
                    type="file"
                    accept=".txt,.md,.rtf,.doc,.docx,.pdf"
                    onChange={(e) =>
                      e.target.files && onUpload(e.target.files[0])
                    }
                  />
                  <p className="upload-help">
                    Upload your career history/CV source file.
                  </p>
                  <p className="upload-help">
                    Personal details are auto-populated from uploaded career history.
                  </p>
                  <select
                    value={template}
                    onChange={(e) =>
                      setTemplate(e.target.value as TemplateName)
                    }
                  >
                    {TEMPLATES.map((name) => (
                      <option key={name} value={name}>
                        {name} Template
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary generate-btn"
                    onClick={generateResume}
                    disabled={analyzingRequirements}
                  >
                    {analyzingRequirements
                      ? "⚙️ Running Agents…"
                      : "🚀 Generate Resume"}
                  </button>
                </div>
              </section>

              <section className="workspace">
                <aside className="skills-panel">
                  <section className="panel-window">
                    <div className="panel-header">
                      <h3>🧠 Experience Repository</h3>
                      <button
                        className="icon-toggle-btn"
                        onClick={() => setFiltersCollapsed((prev) => !prev)}
                        title={filtersCollapsed ? "Show filters" : "Hide filters"}
                        aria-label={
                          filtersCollapsed ? "Show filters" : "Hide filters"
                        }
                      >
                        ☰
                      </button>
                    </div>

                    {!filtersCollapsed && (
                      <div className="filters-line">
                        <select
                          value={companyFilter}
                          onChange={(e) => setCompanyFilter(e.target.value)}
                        >
                          {companies.map((company) => (
                            <option key={company} value={company}>
                              {company}
                            </option>
                          ))}
                        </select>
                        <select
                          value={skillFilter}
                          onChange={(e) => setSkillFilter(e.target.value)}
                        >
                          {skills.map((skill) => (
                            <option key={skill} value={skill}>
                              {skill}
                            </option>
                          ))}
                        </select>
                        <button onClick={applySelectedExperience}>
                          ✅ Apply Selected
                        </button>
                      </div>
                    )}

                    <div className="experience-list">
                      {paginatedExperience.map((item) => (
                        <label key={item.id}>
                          <span>
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => toggleExperience(item.id)}
                            />{" "}
                            {item.text}
                          </span>
                          <small>
                            {item.company} · {item.skillTags.join(", ")}
                          </small>
                        </label>
                      ))}
                    </div>

                    <div className="experience-pagination">
                      <button
                        onClick={() =>
                          setExperiencePage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={experiencePage <= 1}
                      >
                        ◀
                      </button>
                      <span>
                        Page {experiencePage} of {totalExperiencePages}
                      </span>
                      <button
                        onClick={() =>
                          setExperiencePage((prev) =>
                            Math.min(totalExperiencePages, prev + 1),
                          )
                        }
                        disabled={experiencePage >= totalExperiencePages}
                      >
                        ▶
                      </button>
                    </div>
                  </section>

                  <section className="panel-window job-insights-panel">
                    <h4>Job requirements and info</h4>
                    <div className="job-insights-layout">
                      <div className="job-insight-icons">
                        {INSIGHT_TABS.map((name) => (
                          <button
                            key={name}
                            className={`insight-icon-btn ${insightTab === name ? "active" : ""}`}
                            onClick={() => setInsightTab(name)}
                            title={INSIGHT_TAB_LABELS[name]}
                          >
                            <span className="insight-pill-icon">
                              {INSIGHT_TAB_ICONS[name]}
                            </span>
                            <span className="insight-pill-label">
                              {INSIGHT_TAB_LABELS[name]}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="job-insight-content">
                        <h5>{INSIGHT_TAB_LABELS[insightTab]}</h5>
                        <ul>
                          {(insightData[insightTab] || []).map((insight) => (
                            <li key={insight}>{insight}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>
                </aside>

                <main
                  className={`resume-preview ${template.toLowerCase()} ${previewFullscreen ? "is-fullscreen" : ""}`}
                  ref={previewRef}
                >
                  <div className="preview-toolbar">
                    <button
                      className="round-icon-button"
                      onClick={() =>
                        setZoom((prev) => Math.max(0.7, prev - 0.1))
                      }
                    >
                      −
                    </button>
                    <span className="toolbar-zoom-value">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      className="round-icon-button"
                      onClick={() =>
                        setZoom((prev) => Math.min(1.5, prev + 0.1))
                      }
                    >
                      +
                    </button>
                    <button
                      className="round-icon-button toolbar-fullscreen"
                      onClick={togglePreviewFullscreen}
                    >
                      {previewFullscreen ? "⤢" : "⛶"}
                    </button>
                  </div>

                  {sectionPickerOpen && (
                    <div className="section-picker">
                      <div className="section-picker-header top-section-row">
                        <strong>Section controls</strong>
                        <button
                          onClick={() =>
                            setSectionListCollapsed((prev) => !prev)
                          }
                        >
                          {sectionListCollapsed
                            ? "⬇️ Expand List"
                            : "⬆️ Collapse List"}
                        </button>
                      </div>
                      {!sectionListCollapsed &&
                        sections.map((section) => (
                          <div key={section.id} className="section-picker-row">
                            <button onClick={() => toggleSection(section.id)}>
                              {section.visible ? "👁️ Hide" : "👁️ Show"}
                            </button>
                            <input
                              value={section.label}
                              onChange={(e) =>
                                updateSectionLabel(section.id, e.target.value)
                              }
                            />
                            <button onClick={() => moveSection(section.id, "up")}>↑</button>
                            <button onClick={() => moveSection(section.id, "down")}>↓</button>
                          </div>
                        ))}
                    </div>
                  )}

                  <div
                    className={`preview-frame ${previewPdfMode ? "pdf-preview-mode" : ""}`}
                  >
                    <div
                      className="preview-content"
                      style={{ transform: `scale(${zoom})` }}
                    >
                      {sections
                        .filter((section) => section.visible)
                        .map((section) => {
                          if (section.id === "header") {
                            return (
                              <div key={section.id}>
                                {editMode ? (
                                  <div className="manual-editor-grid">
                                    <input
                                      value={editorDraft.fullName}
                                      placeholder="Full name"
                                      onChange={(e) => setEditorDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                                    />
                                    <input
                                      value={editorDraft.primaryTitle}
                                      placeholder="Primary title"
                                      onChange={(e) => setEditorDraft((prev) => ({ ...prev, primaryTitle: e.target.value }))}
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <h2>{previewResume.fullName || "Your Name"}</h2>
                                    <p className="preview-text">{previewResume.primaryTitle || "Primary Title"} – {previewResume.specializations[0] || "Specialization 1"} & {previewResume.specializations[1] || "Specialization 2"}</p>
                                    <p className="preview-text">{previewResume.email || "email@example.com"} · {previewResume.phone || "(000) 000-0000"} · {previewResume.linkedin || "linkedin.com/in/your-profile"} {previewResume.portfolio ? `· ${previewResume.portfolio}` : ""}</p>
                                  </>
                                )}
                              </div>
                            );
                          }
                          if (section.id === "profile") {
                            return (
                              <div key={section.id}>
                                <h4>{section.label}</h4>
                                {editMode ? (
                                  <textarea
                                    className="manual-editor-box"
                                    value={editorDraft.profile}
                                    placeholder="Write a concise 2-4 line profile."
                                    onChange={(e) =>
                                      setEditorDraft((prev) => ({
                                        ...prev,
                                        profile: e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  <p className="preview-text">{previewResume.profile}</p>
                                )}
                              </div>
                            );
                          }
                          if (section.id === "experience") {
                            return (
                              <div key={section.id}>
                                <h4>{section.label}</h4>
                                {previewResume.selectedExperience.map((item, idx) => (
                                  <div className="bullet-row" key={item.id}>
                                    {editMode ? (
                                      <textarea
                                        className="manual-editor-box"
                                        value={item.text}
                                        placeholder="Add an experience bullet"
                                        onChange={(e) =>
                                          setEditorDraft((prev) => ({
                                            ...prev,
                                            selectedExperience: prev.selectedExperience.map((entry) =>
                                              entry.id === item.id
                                                ? { ...entry, text: e.target.value }
                                                : entry,
                                            ),
                                          }))
                                        }
                                      />
                                    ) : (
                                      <p className="preview-bullet">• {toPlainText(item.text)}</p>
                                    )}
                                    {editMode && (
                                      <div className="move-controls">
                                        <button onClick={() => moveBullet(idx, "up")}>↑</button>
                                        <button onClick={() => moveBullet(idx, "down")}>↓</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {editMode && (
                                  <button
                                    className="small-action"
                                    onClick={() =>
                                      setEditorDraft((prev) => ({
                                        ...prev,
                                        selectedExperience: [
                                          ...prev.selectedExperience,
                                          {
                                            id: uuidv4(),
                                            text: "",
                                            company: prev.organization || "",
                                            skillTags: [],
                                            selected: true,
                                          },
                                        ],
                                      }))
                                    }
                                  >
                                    + Add bullet
                                  </button>
                                )}
                              </div>
                            );
                          }
                          if (section.id === "education") {
                            return (
                              <div key={section.id}>
                                <h4>{section.label}</h4>
                                {editMode ? (
                                  <textarea
                                    className="manual-editor-box"
                                    value={editorDraft.education.join("\n")}
                                    placeholder="One education entry per line"
                                    onChange={(e) =>
                                      setEditorDraft((prev) => ({
                                        ...prev,
                                        education: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                                      }))
                                    }
                                  />
                                ) : (
                                  previewResume.education.map((item) => <p className="preview-text" key={item}>{item}</p>)
                                )}
                              </div>
                            );
                          }
                          if (section.id === "skills") {
                            return (
                              <div key={section.id}>
                                <h4>{section.label}</h4>
                                {editMode ? (
                                  <textarea
                                    className="manual-editor-box"
                                    value={editorDraft.keySkills.join("\n")}
                                    placeholder="One skill per line"
                                    onChange={(e) =>
                                      setEditorDraft((prev) => ({
                                        ...prev,
                                        keySkills: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                                      }))
                                    }
                                  />
                                ) : (
                                  <p className="preview-text">{previewResume.keySkills.join(" • ")}</p>
                                )}
                              </div>
                            );
                          }
                          if (section.id === "interests") {
                            return (
                              <div key={section.id}>
                                <h4>{section.label}</h4>
                                {editMode ? (
                                  <textarea
                                    className="manual-editor-box"
                                    value={editorDraft.interests.join("\n")}
                                    placeholder="One interest per line"
                                    onChange={(e) =>
                                      setEditorDraft((prev) => ({
                                        ...prev,
                                        interests: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                                      }))
                                    }
                                  />
                                ) : (
                                  <p className="preview-text">{previewResume.interests.join(" · ")}</p>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div key={section.id}>
                              <h4>{section.label}</h4>
                              {editMode ? (
                                <textarea
                                  className="manual-editor-box"
                                  value={editorDraft.languages.join("\n")}
                                  placeholder="One language per line"
                                  onChange={(e) =>
                                    setEditorDraft((prev) => ({
                                      ...prev,
                                      languages: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                                    }))
                                  }
                                />
                              ) : (
                                <p className="preview-text">{previewResume.languages.join(" · ")}</p>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="preview-bottom-actions">
                    {editMode ? (
                      <>
                        <button className="primary" onClick={saveEditingResume}>Save edits</button>
                        <button onClick={cancelEditingResume}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={startEditingResume}>Edit</button>
                    )}
                    <button
                      onClick={() => setSectionPickerOpen((prev) => !prev)}
                    >
                      Sections
                    </button>
                    <button onClick={() => setPreviewPdfMode((prev) => !prev)}>
                      Preview
                    </button>
                  </div>
                </main>
              </section>

              <section className="check-resume-row">
                <button
                  className="primary"
                  disabled={analyzingRequirements}
                  onClick={runCheckerOnly}
                >
                  {analyzingRequirements ? "Checking…" : "✅ Check Resume"}
                </button>
                {requirementChecks.length === 0 ? (
                  <p className="checklist-empty">
                    No score yet. Run check after your final edits.
                  </p>
                ) : (
                  <ul className="check-results-inline">
                    {requirementChecks.map((check) => (
                      <li key={check.id} className={scoreClass(check.score)}>
                        <span>
                          <input
                            type="checkbox"
                            checked={check.score >= 75}
                            readOnly
                          />{" "}
                          {check.requirement}
                        </span>
                        <small>{check.score}/100</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
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
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.date).toLocaleString()}</td>
                      <td>{item.role}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className={`chat-sidebar ${chatOpen ? "open" : "collapsed"}`}>
          <section className="chat-box">
            <h4>🤝 Chat Agent</h4>
            <div className="chat-feed">
              {chatMessages.map((msg, idx) => (
                <p key={`${msg}-${idx}`}>{msg}</p>
              ))}
            </div>
            <textarea
              placeholder="Answer missing-info questions here"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button className="primary" onClick={submitGapAnswer}>
              📤 Send to Refiner
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default App;
