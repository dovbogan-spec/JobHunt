import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";
import { AGENT_PROMPTS, type AgentPromptId } from "./agentPrompts";
import "./App.css";

type TemplateName = "Modern" | "Classic" | "Technical" | "Professional";
type TabName = "resume" | "coverLetter" | "history" | "llmIntegration";
type DateMode = "yearOnly" | "yearMonth";
type PersonalDetailField = { id: string; label: string; value: string };
type ExperienceEntry = {
  id: string;
  title: string;
  subTitle: string;
  startDate: string;
  endDate: string;
  dateMode: DateMode;
  isCurrent: boolean;
};
type SkillEntry = { id: string; name: string; level: string };
type EducationEntry = {
  id: string;
  institution: string;
  degree: string;
  startDate: string;
  endDate: string;
  dateMode: DateMode;
  isCurrent: boolean;
  languageLevel: string;
};
type CustomSectionEntry = { id: string; title: string; content: string };
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
type ResumeSection = { id: string; label: string; visible: boolean };
type SubmissionStatus = "active" | "churned";
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
  status: SubmissionStatus;
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

type CandidateMatrix = {
  candidateName: string;
  professionalTimeline: string[];
  technicalSkills: string[];
  industryDomains: string[];
  methodologies: string[];
  certifications: string[];
  totalYearsExperience: string;
  primaryExpertDomain: string;
  education: string[];
  parsedBullets: string[];
};
type LlmSettings = {
  enabled: boolean;
  provider: LlmProvider;
  model: string;
  endpoint: string;
  organizationId: string;
  azureApiVersion: string;
  customHeaders: string;
};
type ExperienceFieldType = "text" | "date" | "title" | "subTitle";
type ExperienceFieldWidth = "full" | "half";
type ExperienceEditorField = {
  id: string;
  type: ExperienceFieldType;
  value: string;
  width: ExperienceFieldWidth;
};
type ExperienceEditorItem = {
  id: string;
  fields: ExperienceEditorField[];
};
type DropZonePosition = "top" | "bottom" | "left" | "right";
type DropIndicator = {
  itemId: string;
  fieldId: string;
  position: DropZonePosition;
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
  model: "gpt-4o-mini",
  endpoint: "",
  organizationId: "",
  azureApiVersion: "2024-10-21",
  customHeaders: "",
};
type ConnectivityStatus = "idle" | "testing" | "success" | "error";
const initialSections: ResumeSection[] = [
  { id: "header", label: "Personal Details", visible: true },
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

function normalizeHistory(
  value: unknown,
): SubmissionHistory[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const item = entry as SubmissionHistory;
    return {
      ...item,
      status: item.status === "churned" ? "churned" : "active",
    };
  });
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
  const [history, setHistory] = useState<SubmissionHistory[]>(() => {
    const raw = localStorage.getItem("job-hunt-history");
    if (!raw) return [];
    try {
      return normalizeHistory(JSON.parse(raw));
    } catch {
      return [];
    }
  });
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
  const [experienceEditor, setExperienceEditor] = useState<ExperienceEditorItem[]>([]);
  const [openFieldMenuFor, setOpenFieldMenuFor] = useState<string | null>(null);
  const [draggingField, setDraggingField] = useState<{ itemId: string; fieldId: string } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [draggingSection, setDraggingSection] = useState<string | null>(null);
  const [sectionDragOver, setSectionDragOver] = useState<string | null>(null);
  const [personalDetailFields, setPersonalDetailFields] = useState<PersonalDetailField[]>([
    { id: "pd-fullname", label: "Full Name", value: "" },
    { id: "pd-title", label: "Title", value: "" },
    { id: "pd-email", label: "Email", value: "" },
    { id: "pd-phone", label: "Phone", value: "" },
    { id: "pd-linkedin", label: "LinkedIn", value: "" },
  ]);
  const [experienceEntries, setExperienceEntries] = useState<ExperienceEntry[]>([]);
  const [skillEntries, setSkillEntries] = useState<SkillEntry[]>([]);
  const [educationEntries, setEducationEntries] = useState<EducationEntry[]>([]);
  const [customSectionContents, setCustomSectionContents] = useState<Record<string, CustomSectionEntry[]>>({});
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [sectionListCollapsed, setSectionListCollapsed] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [tabsCollapsed, setTabsCollapsed] = useState(false);
  const [hasGeneratedResume, setHasGeneratedResume] = useState(false);
  const [showIntake, setShowIntake] = useState(true);
  const [sections, setSections] = useState<ResumeSection[]>(initialSections);
  const [activeSectionId, setActiveSectionId] = useState<string>(
    initialSections.find((section) => section.visible)?.id ?? initialSections[0].id,
  );
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
      const parsed = JSON.parse(raw) as Partial<LlmSettings> & {
        apiKey?: string;
      };
      const safeSettings = { ...parsed };
      delete safeSettings.apiKey;
      return { ...defaultLlmSettings, ...safeSettings };
    } catch {
      return defaultLlmSettings;
    }
  });
  const [saveMessage, setSaveMessage] = useState("");
  const [connectivityStatus, setConnectivityStatus] =
    useState<ConnectivityStatus>("idle");
  const [connectivityErrorCode, setConnectivityErrorCode] = useState("");
  const [byokEnabled, setByokEnabled] = useState(false);
  const previewRef = useRef<HTMLElement | null>(null);
  const richTextEditorRef = useRef<HTMLDivElement | null>(null);
  const previewResume = editMode ? editorDraft : resume;
  const activeSection = sections.find((section) => section.id === activeSectionId);

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
    setConnectivityStatus("idle");
    setConnectivityErrorCode("");
  }, [llmSettings]);
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
  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data: { features?: { byokEnabled?: boolean } }) => {
        setByokEnabled(Boolean(data.features?.byokEnabled));
      })
      .catch(() => {
        setByokEnabled(false);
      });
  }, []);
  useEffect(() => {
    if (!byokEnabled && tab === "llmIntegration") {
      setTab("resume");
    }
  }, [byokEnabled, tab]);
  useEffect(() => {
    const fallback = sections.find((section) => section.visible)?.id;
    if (!sections.some((section) => section.id === activeSectionId && section.visible) && fallback) {
      setActiveSectionId(fallback);
    }
  }, [activeSectionId, sections]);

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

  function saveLlmSettings() {
    localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(llmSettings));
    setSaveMessage("Model API integration settings saved.");
  }

  function getLlmConnectionInfo(settings: LlmSettings) {
    return {
      provider: settings.provider,
      model: settings.model.trim() || "gpt-4o-mini",
    };
  }

  function getCustomHeaders(settings: LlmSettings) {
    const headers: Record<string, string> = {};
    if (!settings.customHeaders.trim()) return headers;
    settings.customHeaders.split("\n").forEach((line) => {
      const [headerName, ...valueParts] = line.split(":");
      if (!headerName || valueParts.length === 0) return;
      headers[headerName.trim()] = valueParts.join(":").trim();
    });
    return headers;
  }

  function getModelApiConfig(settings: LlmSettings) {
    const configured = settings.enabled ? getLlmConnectionInfo(settings) : null;
    const apiUrl = settings.endpoint.trim() || import.meta.env.VITE_LLM_API_URL;
    const model =
      configured?.model || import.meta.env.VITE_LLM_MODEL || "gpt-4o-mini";
    return { apiUrl, model };
  }

  async function testModelApiConnectivity() {
    setConnectivityStatus("testing");
    setConnectivityErrorCode("");

    try {
      const { provider } = getLlmConnectionInfo(llmSettings);
      const { apiUrl, model } = getModelApiConfig(llmSettings);
      if (!apiUrl) throw new Error("NO_ENDPOINT_CONFIGURED");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getCustomHeaders(llmSettings),
      };
      if (llmSettings.organizationId.trim()) {
        headers["OpenAI-Organization"] = llmSettings.organizationId.trim();
      }

      const requestBody: Record<string, unknown> = {
        provider,
        model,
        messages: [{ role: "user", content: "ping" }],
      };

      const response = await fetch("/api/llm/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        setConnectivityStatus("error");
        setConnectivityErrorCode(`HTTP ${response.status}`);
        return;
      }

      setConnectivityStatus("success");
    } catch (error) {
      setConnectivityStatus("error");
      setConnectivityErrorCode(
        error instanceof Error ? error.message : "PING_FAILED",
      );
    }
  }

  async function callModel(
    agent: AgentPromptId,
    payload: Record<string, unknown>,
  ) {
    const { provider } = getLlmConnectionInfo(llmSettings);
    const { apiUrl, model } = getModelApiConfig(llmSettings);
    if (!apiUrl) return null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getCustomHeaders(llmSettings),
    };
    if (llmSettings.enabled && llmSettings.organizationId.trim())
      headers["OpenAI-Organization"] = llmSettings.organizationId.trim();

    const requestBody = {
      provider,
      model,
      messages: [
        { role: "system", content: AGENT_PROMPTS[agent] },
        { role: "user", content: JSON.stringify(payload) },
      ],
    };

    const res = await fetch("/api/llm/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) throw new Error(`Agent ${agent} failed`);
    const data = await res.json();
    const content = data.content || "{}";
    try {
      return JSON.parse(content);
    } catch {
      return {};
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
        status: existingIndex >= 0 ? prev[existingIndex].status : "active",
      };

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated.splice(existingIndex, 1);
        return [nextEntry, ...updated].slice(0, 30);
      }

      return [nextEntry, ...prev].slice(0, 30);
    });
  }

  function setHistoryStatus(id: string, status: SubmissionStatus) {
    setHistory((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, status } : entry)),
    );
  }

  function deleteHistoryItem(id: string) {
    setHistory((prev) => prev.filter((entry) => entry.id !== id));
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
    const fallback: CandidateMatrix = {
      candidateName: extractPersonInfo(documentText).fullName || "Unknown",
      professionalTimeline: [],
      parsedBullets: parseExperience(documentText).map((x) => x.text),
      technicalSkills: SKILL_KEYWORDS.filter((skill) =>
        documentText.toLowerCase().includes(skill),
      ),
      industryDomains: [],
      methodologies: [],
      certifications: [],
      totalYearsExperience: "unknown",
      primaryExpertDomain: "unknown",
      education: [],
    };

    if (!llm || typeof llm !== "object") return fallback;

    const candidate = llm as Record<string, unknown>;
    return {
      candidateName: String(candidate.candidateName || fallback.candidateName),
      professionalTimeline: Array.isArray(candidate.professionalTimeline)
        ? candidate.professionalTimeline.map((item) => String(item)).filter(Boolean)
        : fallback.professionalTimeline,
      technicalSkills: Array.isArray(candidate.technicalSkills)
        ? candidate.technicalSkills.map((item) => String(item)).filter(Boolean)
        : fallback.technicalSkills,
      industryDomains: Array.isArray(candidate.industryDomains)
        ? candidate.industryDomains.map((item) => String(item)).filter(Boolean)
        : fallback.industryDomains,
      methodologies: Array.isArray(candidate.methodologies)
        ? candidate.methodologies.map((item) => String(item)).filter(Boolean)
        : fallback.methodologies,
      certifications: Array.isArray(candidate.certifications)
        ? candidate.certifications.map((item) => String(item)).filter(Boolean)
        : fallback.certifications,
      totalYearsExperience: String(
        candidate.totalYearsExperience || fallback.totalYearsExperience,
      ),
      primaryExpertDomain: String(
        candidate.primaryExpertDomain || fallback.primaryExpertDomain,
      ),
      education: Array.isArray(candidate.education)
        ? candidate.education.map((item) => String(item)).filter(Boolean)
        : fallback.education,
      parsedBullets: Array.isArray(candidate.parsedBullets)
        ? candidate.parsedBullets.map((item) => String(item)).filter(Boolean)
        : fallback.parsedBullets,
    } satisfies CandidateMatrix;
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
    setHasGeneratedResume(true);
    setShowIntake(false);
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
  function toggleSection(id: string) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, visible: !section.visible } : section,
      ),
    );
  }
  function updateSectionLabel(id: string, label: string) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, label } : section,
      ),
    );
  }
  function reorderSection(fromId: string, toId: string) {
    setSections((prev) => {
      const fromIndex = prev.findIndex((s) => s.id === fromId);
      const toIndex = prev.findIndex((s) => s.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  }
  function addCustomSection() {
    const id = `custom-${uuidv4()}`;
    setSections((prev) => [...prev, { id, label: "New Section", visible: true }]);
    setCustomSectionContents((prev) => ({
      ...prev,
      [id]: [{ id: uuidv4(), title: "", content: "" }],
    }));
  }
  function openSectionEditor(id: string) {
    if (!editMode) {
      setEditorDraft({ ...resume, selectedExperience: [...resume.selectedExperience] });
      setPersonalDetailFields([
        { id: "pd-fullname", label: "Full Name", value: resume.fullName },
        { id: "pd-title", label: "Title", value: resume.primaryTitle },
        { id: "pd-email", label: "Email", value: resume.email },
        { id: "pd-phone", label: "Phone", value: resume.phone },
        { id: "pd-linkedin", label: "LinkedIn", value: resume.linkedin },
      ]);
      setExperienceEditor(
        resume.selectedExperience.map((item) => ({
          id: item.id,
          fields: [
            { id: uuidv4(), type: "title" as ExperienceFieldType, value: item.company || resume.organization || "", width: "full" as ExperienceFieldWidth },
            { id: uuidv4(), type: "text" as ExperienceFieldType, value: item.text, width: "full" as ExperienceFieldWidth },
          ],
        })),
      );
    }
    setActiveSectionId(id);
    setEditMode(true);
  }
  function updatePersonalDetailField(id: string, value: string) {
    setPersonalDetailFields((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));
  }
  function updatePersonalDetailLabel(id: string, label: string) {
    setPersonalDetailFields((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)));
  }
  function addPersonalDetailField() {
    setPersonalDetailFields((prev) => [...prev, { id: uuidv4(), label: "New Field", value: "" }]);
  }
  function removePersonalDetailField(id: string) {
    setPersonalDetailFields((prev) => prev.filter((f) => f.id !== id));
  }
  function addExperienceEntry() {
    setExperienceEntries((prev) => [...prev, { id: uuidv4(), title: "", subTitle: "", startDate: "", endDate: "", dateMode: "yearMonth", isCurrent: false }]);
  }
  function updateExperienceEntry(id: string, field: keyof ExperienceEntry, value: string | boolean | DateMode) {
    setExperienceEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  }
  function removeExperienceEntry(id: string) {
    setExperienceEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function addSkillEntry() {
    setSkillEntries((prev) => [...prev, { id: uuidv4(), name: "", level: "" }]);
  }
  function updateSkillEntry(id: string, field: keyof SkillEntry, value: string) {
    setSkillEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  }
  function removeSkillEntry(id: string) {
    setSkillEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function addEducationEntry() {
    setEducationEntries((prev) => [...prev, { id: uuidv4(), institution: "", degree: "", startDate: "", endDate: "", dateMode: "yearMonth", isCurrent: false, languageLevel: "" }]);
  }
  function updateEducationEntry(id: string, field: keyof EducationEntry, value: string | boolean | DateMode) {
    setEducationEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  }
  function removeEducationEntry(id: string) {
    setEducationEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function addCustomSectionEntry(sectionId: string) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] || []), { id: uuidv4(), title: "", content: "" }],
    }));
  }
  function updateCustomSectionEntry(sectionId: string, entryId: string, field: keyof CustomSectionEntry, value: string) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map((e) => (e.id === entryId ? { ...e, [field]: value } : e)),
    }));
  }
  function removeCustomSectionEntry(sectionId: string, entryId: string) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).filter((e) => e.id !== entryId),
    }));
  }
  function startEditingResume() {
    setEditorDraft({ ...resume, selectedExperience: [...resume.selectedExperience] });
    setPersonalDetailFields([
      { id: "pd-fullname", label: "Full Name", value: resume.fullName },
      { id: "pd-title", label: "Title", value: resume.primaryTitle },
      { id: "pd-email", label: "Email", value: resume.email },
      { id: "pd-phone", label: "Phone", value: resume.phone },
      { id: "pd-linkedin", label: "LinkedIn", value: resume.linkedin },
    ]);
    setExperienceEditor(
      resume.selectedExperience.map((item) => ({
        id: item.id,
        fields: [
          {
            id: uuidv4(),
            type: "title" as ExperienceFieldType,
            value: item.company || resume.organization || "",
            width: "full" as ExperienceFieldWidth,
          },
          {
            id: uuidv4(),
            type: "text" as ExperienceFieldType,
            value: item.text,
            width: "full" as ExperienceFieldWidth,
          },
        ],
      })),
    );
    setActiveSectionId(
      sections.find((section) => section.visible)?.id ?? sections[0]?.id ?? "header",
    );
    setEditMode(true);
  }
  function saveEditingResume() {
    const findField = (label: string) => personalDetailFields.find((f) => f.label === label)?.value ?? "";
    setResume({
      ...editorDraft,
      fullName: findField("Full Name") || editorDraft.fullName,
      primaryTitle: findField("Title") || editorDraft.primaryTitle,
      email: findField("Email") || editorDraft.email,
      phone: findField("Phone") || editorDraft.phone,
      linkedin: findField("LinkedIn") || editorDraft.linkedin,
    });
    setEditMode(false);
    setSaveMessage("Resume edits saved.");
  }
  function cancelEditingResume() {
    setEditorDraft({ ...resume, selectedExperience: [...resume.selectedExperience] });
    setEditMode(false);
  }
  function updateActiveSectionVisibility(visible: boolean) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === activeSectionId ? { ...section, visible } : section,
      ),
    );
  }

  useEffect(() => {
    if (!editMode) return;
    const activeSection = sections.find((section) => section.id === activeSectionId);
    if (activeSection?.visible) return;
    const firstVisibleSection = sections.find((section) => section.visible);
    if (firstVisibleSection) {
      setActiveSectionId(firstVisibleSection.id);
    }
  }, [activeSectionId, editMode, sections]);
  function updateExperienceField(itemId: string, fieldId: string, value: string) {
    setExperienceEditor((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              fields: item.fields.map((field) =>
                field.id === fieldId ? { ...field, value } : field,
              ),
            }
          : item,
      ),
    );
  }
  function addExperienceMainBox() {
    setExperienceEditor((prev) => [
      ...prev,
      {
        id: uuidv4(),
        fields: [{ id: uuidv4(), type: "text", value: "", width: "full" }],
      },
    ]);
  }

  function addExperienceField(itemId: string, type: ExperienceFieldType) {
    setExperienceEditor((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              fields: [
                ...item.fields,
                {
                  id: uuidv4(),
                  type,
                  value: "",
                  width: type === "text" ? "full" : "half",
                },
              ],
            }
          : item,
      ),
    );
  }

  function clearActiveSectionContent() {
    if (activeSectionId === "header") {
      setPersonalDetailFields((prev) => prev.map((f) => ({ ...f, value: "" })));
      return;
    }
    setEditorDraft((prev) => {
      switch (activeSectionId) {
        case "profile":
          return { ...prev, profile: "" };
        case "experience":
          return { ...prev, selectedExperience: [] };
        case "education":
          return { ...prev, education: [] };
        case "skills":
          return { ...prev, keySkills: [] };
        case "interests":
          return { ...prev, interests: [] };
        case "languages":
          return { ...prev, languages: [] };
        default:
          if (activeSectionId.startsWith("custom-")) {
            setCustomSectionContents((prev) => ({
              ...prev,
              [activeSectionId]: [{ id: uuidv4(), title: "", content: "" }],
            }));
          }
          return prev;
      }
    });
  }
  function applyRichCommand(command: "bold" | "italic" | "underline" | "insertUnorderedList" | "createLink" | "justifyLeft" | "justifyCenter" | "justifyRight") {
    if (!richTextEditorRef.current) return;
    richTextEditorRef.current.focus();
    if (command === "createLink") {
      const url = window.prompt("Enter link URL", "https://");
      if (!url) return;
      document.execCommand("createLink", false, url);
      return;
    }
    document.execCommand(command, false);
  }

  function moveExperienceField(itemId: string, targetFieldId: string, position: DropZonePosition) {
    if (!draggingField || draggingField.itemId !== itemId || draggingField.fieldId === targetFieldId) return;
    setExperienceEditor((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const source = item.fields.find((field) => field.id === draggingField.fieldId);
        const targetIndex = item.fields.findIndex((field) => field.id === targetFieldId);
        if (!source || targetIndex < 0) return item;
        const withoutSource = item.fields.filter((field) => field.id !== draggingField.fieldId);
        const adjustedTargetIndex = withoutSource.findIndex((field) => field.id === targetFieldId);
        const sourceField: ExperienceEditorField = {
          ...source,
          width: position === "left" || position === "right" ? "half" : "full",
        };
        const insertAt = position === "top" || position === "left" ? adjustedTargetIndex : adjustedTargetIndex + 1;
        const next = [...withoutSource];
        next.splice(insertAt, 0, sourceField);
        if (position === "left" || position === "right") {
          return {
            ...item,
            fields: next.map((field) => ({
              ...field,
              width:
                field.id === sourceField.id || field.id === targetFieldId
                  ? "half"
                  : "full",
            })),
          };
        }
        return { ...item, fields: next };
      }),
    );
    setDraggingField(null);
    setDropIndicator(null);
  }
  function moveExperienceFieldByOffset(itemId: string, fieldId: string, direction: "up" | "down") {
    setExperienceEditor((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const currentIndex = item.fields.findIndex((field) => field.id === fieldId);
        if (currentIndex < 0) return item;
        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= item.fields.length) return item;
        const next = [...item.fields];
        const [moved] = next.splice(currentIndex, 1);
        next.splice(targetIndex, 0, { ...moved, width: "full" });
        return {
          ...item,
          fields: next.map((field, index) =>
            index === targetIndex ? field : { ...field, width: "full" },
          ),
        };
      }),
    );
  }
  function updateListField<K extends "education" | "keySkills" | "interests" | "languages">(
    key: K,
    index: number,
    value: string,
  ) {
    setEditorDraft((prev) => ({
      ...prev,
      [key]: prev[key].map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ).filter((item) => item.trim().length > 0 || item === value),
    }));
  }
  function appendListField(key: "education" | "keySkills" | "interests" | "languages") {
    setEditorDraft((prev) => ({ ...prev, [key]: [...prev[key], ""] }));
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

      const extractedText = payload.extracted?.text || "";
      setExperienceDoc(extractedText);

      const info = extractPersonInfo(extractedText);
      setResume((prev) => ({
        ...prev,
        fullName: info.fullName || prev.fullName,
        email: info.email || prev.email,
        phone: info.phone || prev.phone,
      }));

      const candidate = await runAgent3Parser(extractedText);
      const parsedBullets = candidate.parsedBullets.length
        ? candidate.parsedBullets
        : parseExperience(extractedText).map((item) => item.text);

      const parsedItems: ExperienceItem[] = parsedBullets.map((line) => ({
        id: uuidv4(),
        text: line,
        company:
          line.match(/at\s+([A-Z][A-Za-z0-9&\s-]+)/)?.[1]?.trim() || "General",
        skillTags: SKILL_KEYWORDS.filter((skill) =>
          line.toLowerCase().includes(skill),
        ).slice(0, 8),
        selected: true,
      }));
      setExperienceItems(
        parsedItems.map((item) => ({
          ...item,
          skillTags: item.skillTags.length ? item.skillTags : ["general"],
        })),
      );
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
          {byokEnabled && (
            <button
              className={`small-action ${tab === "llmIntegration" ? "active" : ""}`}
              onClick={() => setTab("llmIntegration")}
            >
              🤖 Model API
            </button>
          )}
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
            <div className="tabs-row">
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
              {tab === "resume" && hasGeneratedResume && (
                <button className="small-action" onClick={() => setShowIntake((prev) => !prev)}>
                  {showIntake ? "Hide Input" : "Edit Input"}
                </button>
              )}
            </div>
          )}

          {tab === "resume" && (
            <>
              {showIntake && (
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
              )}

              <section className={`workspace ${editMode ? "workspace-edit-mode" : ""}`}>
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

                <aside className="section-manager-panel edit-box">
                    <div className="section-manager-header">
                      <button
                        className="add-section-btn"
                        onClick={addCustomSection}
                        title="Add section"
                        aria-label="Add section"
                      >
                        +
                      </button>
                      <h4>Sections</h4>
                    </div>
                    <div
                      className="section-manager-list"
                      onDragOver={(e) => e.preventDefault()}
                    >
                      {sections.map((section) => (
                        <div
                          key={section.id}
                          className={`section-manager-row ${activeSectionId === section.id && editMode ? "active" : ""} ${!section.visible ? "is-hidden" : ""} ${sectionDragOver === section.id ? "drag-over" : ""}`}
                          draggable
                          onDragStart={() => setDraggingSection(section.id)}
                          onDragOver={(e) => { e.preventDefault(); setSectionDragOver(section.id); }}
                          onDragLeave={() => setSectionDragOver(null)}
                          onDrop={() => {
                            if (draggingSection && draggingSection !== section.id) {
                              reorderSection(draggingSection, section.id);
                            }
                            setDraggingSection(null);
                            setSectionDragOver(null);
                          }}
                          onDragEnd={() => { setDraggingSection(null); setSectionDragOver(null); }}
                        >
                          <span className="section-drag-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
                          <button
                            className="section-pencil-btn"
                            onClick={() => openSectionEditor(section.id)}
                            title={`Edit ${section.label}`}
                            aria-label={`Edit ${section.label} section`}
                          >
                            ✏️
                          </button>
                          <span className="section-row-label">{section.label || "Untitled section"}</span>
                          <button
                            className="section-visibility-btn"
                            onClick={() => toggleSection(section.id)}
                            title={section.visible ? "Hide section" : "Show section"}
                            aria-label={section.visible ? "Hide section" : "Show section"}
                          >
                            {section.visible ? "👁" : "🚫"}
                          </button>
                        </div>
                      ))}
                    </div>
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
                          <div
                            key={section.id}
                            className={`section-picker-row ${section.id === activeSectionId ? "active" : ""}`}
                          >
                            <button onClick={() => toggleSection(section.id)}>
                              {section.visible ? "👁️ Hide" : "👁️ Show"}
                            </button>
                            <input
                              value={section.label}
                              onFocus={() => setActiveSectionId(section.id)}
                              onChange={(e) =>
                                updateSectionLabel(section.id, e.target.value)
                              }
                            />
                          </div>
                        ))}
                    </div>
                  )}

                  {editMode && activeSection && (
                    <section className="focused-editor-card">
                      <header className="focused-editor-header">
                        <div>
                          <p className="focused-editor-kicker">Editing section</p>
                          <h4>{activeSection.label}</h4>
                        </div>
                        <div className="focused-editor-actions">
                          <button onClick={() => updateActiveSectionVisibility(false)}>Hide</button>
                          <button onClick={clearActiveSectionContent}>Clear</button>
                        </div>
                      </header>

                      {/* Personal Details */}
                      {activeSectionId === "header" && (
                        <div className="structured-editor-list">
                          {personalDetailFields.map((field) => (
                            <div key={field.id} className="pd-field-row">
                              <input
                                className="pd-label-input"
                                value={field.label}
                                onChange={(e) => updatePersonalDetailLabel(field.id, e.target.value)}
                                placeholder="Field label"
                              />
                              <input
                                className="pd-value-input"
                                value={field.value}
                                onChange={(e) => updatePersonalDetailField(field.id, e.target.value)}
                                placeholder={field.label}
                              />
                              <button
                                className="remove-field-btn"
                                onClick={() => removePersonalDetailField(field.id)}
                                title="Remove field"
                                aria-label="Remove field"
                              >
                                −
                              </button>
                            </div>
                          ))}
                          <button className="small-action add-field-btn" onClick={addPersonalDetailField}>
                            + Add field
                          </button>
                        </div>
                      )}

                      {/* Profile */}
                      {activeSectionId === "profile" && (
                        <>
                          <div className="editor-toolbar-strip">
                            <button onClick={() => applyRichCommand("bold")}><strong>B</strong></button>
                            <button onClick={() => applyRichCommand("italic")}><em>I</em></button>
                            <button onClick={() => applyRichCommand("underline")}><u>U</u></button>
                            <button onClick={() => applyRichCommand("justifyLeft")}>⬛</button>
                            <button onClick={() => applyRichCommand("justifyCenter")}>≡</button>
                            <button onClick={() => applyRichCommand("justifyRight")}>⬜</button>
                            <button onClick={() => applyRichCommand("insertUnorderedList")}>• List</button>
                            <button onClick={() => document.execCommand("insertOrderedList", false)}>1. List</button>
                            <button onClick={() => applyRichCommand("createLink")}>🔗</button>
                          </div>
                          <div
                            ref={richTextEditorRef}
                            className="rich-editor-surface"
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(e) =>
                              setEditorDraft((prev) => ({
                                ...prev,
                                profile: (e.target as HTMLDivElement).innerHTML,
                              }))
                            }
                            dangerouslySetInnerHTML={{ __html: editorDraft.profile || "<p>Write your profile…</p>" }}
                          />
                        </>
                      )}

                      {/* Experience */}
                      {activeSectionId === "experience" && (
                        <div className="structured-editor-list">
                          <button className="small-action add-entry-top-btn" onClick={addExperienceEntry}>
                            + Add experience
                          </button>
                          {experienceEntries.map((entry) => (
                            <div key={entry.id} className="entry-box">
                              <div className="entry-box-header">
                                <span className="entry-box-type">Experience</span>
                                <button className="remove-entry-btn" onClick={() => removeExperienceEntry(entry.id)} title="Remove">✕</button>
                              </div>
                              <input
                                value={entry.title}
                                placeholder="Title (e.g. Software Engineer)"
                                onChange={(e) => updateExperienceEntry(entry.id, "title", e.target.value)}
                              />
                              <input
                                value={entry.subTitle}
                                placeholder="Sub Title (e.g. Company Name)"
                                onChange={(e) => updateExperienceEntry(entry.id, "subTitle", e.target.value)}
                              />
                              <div className="date-mode-row">
                                <label>
                                  <input
                                    type="radio"
                                    name={`dateMode-${entry.id}`}
                                    value="yearMonth"
                                    checked={entry.dateMode === "yearMonth"}
                                    onChange={() => updateExperienceEntry(entry.id, "dateMode", "yearMonth")}
                                  />
                                  {" "}Year &amp; Month
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name={`dateMode-${entry.id}`}
                                    value="yearOnly"
                                    checked={entry.dateMode === "yearOnly"}
                                    onChange={() => updateExperienceEntry(entry.id, "dateMode", "yearOnly")}
                                  />
                                  {" "}Year only
                                </label>
                              </div>
                              <div className="date-fields-row">
                                {entry.dateMode === "yearOnly" ? (
                                  <input
                                    type="number"
                                    min="1950"
                                    max="2100"
                                    placeholder="Start year"
                                    value={entry.startDate}
                                    onChange={(e) => updateExperienceEntry(entry.id, "startDate", e.target.value)}
                                  />
                                ) : (
                                  <input
                                    type="month"
                                    placeholder="Start date"
                                    value={entry.startDate}
                                    onChange={(e) => updateExperienceEntry(entry.id, "startDate", e.target.value)}
                                  />
                                )}
                                {entry.isCurrent ? (
                                  <span className="current-label">Current</span>
                                ) : entry.dateMode === "yearOnly" ? (
                                  <input
                                    type="number"
                                    min="1950"
                                    max="2100"
                                    placeholder="End year"
                                    value={entry.endDate}
                                    onChange={(e) => updateExperienceEntry(entry.id, "endDate", e.target.value)}
                                  />
                                ) : (
                                  <input
                                    type="month"
                                    placeholder="End date"
                                    value={entry.endDate}
                                    onChange={(e) => updateExperienceEntry(entry.id, "endDate", e.target.value)}
                                  />
                                )}
                                <label className="current-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={entry.isCurrent}
                                    onChange={(e) => updateExperienceEntry(entry.id, "isCurrent", e.target.checked)}
                                  />
                                  {" "}Current
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Skills */}
                      {activeSectionId === "skills" && (
                        <div className="structured-editor-list">
                          <button className="small-action add-entry-top-btn" onClick={addSkillEntry}>
                            + Add skill
                          </button>
                          {skillEntries.map((entry) => (
                            <div key={entry.id} className="entry-box skill-entry-box">
                              <div className="entry-box-header">
                                <span className="entry-box-type">Skill</span>
                                <button className="remove-entry-btn" onClick={() => removeSkillEntry(entry.id)} title="Remove">✕</button>
                              </div>
                              <input
                                value={entry.name}
                                placeholder="Skill name"
                                onChange={(e) => updateSkillEntry(entry.id, "name", e.target.value)}
                              />
                              <input
                                value={entry.level}
                                placeholder="Level (e.g. Expert, Intermediate)"
                                onChange={(e) => updateSkillEntry(entry.id, "level", e.target.value)}
                              />
                            </div>
                          ))}
                          {skillEntries.length === 0 && (
                            <p className="editor-empty-state">No skills added yet. Empty entries are ignored in the CV.</p>
                          )}
                        </div>
                      )}

                      {/* Education */}
                      {activeSectionId === "education" && (
                        <div className="structured-editor-list">
                          <button className="small-action add-entry-top-btn" onClick={addEducationEntry}>
                            + Add education
                          </button>
                          {educationEntries.map((entry) => (
                            <div key={entry.id} className="entry-box">
                              <div className="entry-box-header">
                                <span className="entry-box-type">Education</span>
                                <button className="remove-entry-btn" onClick={() => removeEducationEntry(entry.id)} title="Remove">✕</button>
                              </div>
                              <input
                                value={entry.institution}
                                placeholder="Institution"
                                onChange={(e) => updateEducationEntry(entry.id, "institution", e.target.value)}
                              />
                              <input
                                value={entry.degree}
                                placeholder="Degree / Field of study"
                                onChange={(e) => updateEducationEntry(entry.id, "degree", e.target.value)}
                              />
                              <label className="field-label-row">
                                <span>Language level</span>
                                <select
                                  value={entry.languageLevel}
                                  onChange={(e) => updateEducationEntry(entry.id, "languageLevel", e.target.value)}
                                >
                                  <option value="">— Select —</option>
                                  <option value="A1">A1 – Beginner</option>
                                  <option value="A2">A2 – Elementary</option>
                                  <option value="B1">B1 – Intermediate</option>
                                  <option value="B2">B2 – Upper Intermediate</option>
                                  <option value="C1">C1 – Advanced</option>
                                  <option value="C2">C2 – Proficient</option>
                                  <option value="Native">Native</option>
                                </select>
                              </label>
                              <div className="date-mode-row">
                                <label>
                                  <input
                                    type="radio"
                                    name={`eduDateMode-${entry.id}`}
                                    value="yearMonth"
                                    checked={entry.dateMode === "yearMonth"}
                                    onChange={() => updateEducationEntry(entry.id, "dateMode", "yearMonth")}
                                  />
                                  {" "}Year &amp; Month
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name={`eduDateMode-${entry.id}`}
                                    value="yearOnly"
                                    checked={entry.dateMode === "yearOnly"}
                                    onChange={() => updateEducationEntry(entry.id, "dateMode", "yearOnly")}
                                  />
                                  {" "}Year only
                                </label>
                              </div>
                              <div className="date-fields-row">
                                {entry.dateMode === "yearOnly" ? (
                                  <input type="number" min="1950" max="2100" placeholder="Start year" value={entry.startDate} onChange={(e) => updateEducationEntry(entry.id, "startDate", e.target.value)} />
                                ) : (
                                  <input type="month" placeholder="Start date" value={entry.startDate} onChange={(e) => updateEducationEntry(entry.id, "startDate", e.target.value)} />
                                )}
                                {entry.isCurrent ? (
                                  <span className="current-label">Current</span>
                                ) : entry.dateMode === "yearOnly" ? (
                                  <input type="number" min="1950" max="2100" placeholder="End year" value={entry.endDate} onChange={(e) => updateEducationEntry(entry.id, "endDate", e.target.value)} />
                                ) : (
                                  <input type="month" placeholder="End date" value={entry.endDate} onChange={(e) => updateEducationEntry(entry.id, "endDate", e.target.value)} />
                                )}
                                <label className="current-checkbox">
                                  <input type="checkbox" checked={entry.isCurrent} onChange={(e) => updateEducationEntry(entry.id, "isCurrent", e.target.checked)} />
                                  {" "}Current
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Interests / Languages */}
                      {(activeSectionId === "interests" || activeSectionId === "languages") && (
                        <div className="structured-editor-list">
                          {(activeSectionId === "interests" ? editorDraft.interests : editorDraft.languages).map((item, index) => (
                            <div className="structured-editor-row" key={`${activeSectionId}-${index}`}>
                              <input
                                value={item}
                                onChange={(e) =>
                                  updateListField(
                                    activeSectionId === "interests" ? "interests" : "languages",
                                    index,
                                    e.target.value,
                                  )
                                }
                              />
                              <button
                                className="remove-field-btn"
                                onClick={() => {
                                  const key = activeSectionId === "interests" ? "interests" : "languages";
                                  setEditorDraft((prev) => ({
                                    ...prev,
                                    [key]: (prev[key] as string[]).filter((_, i) => i !== index),
                                  }));
                                }}
                                title="Remove"
                              >
                                −
                              </button>
                            </div>
                          ))}
                          <button
                            className="small-action"
                            onClick={() => appendListField(activeSectionId === "interests" ? "interests" : "languages")}
                          >
                            + Add item
                          </button>
                        </div>
                      )}

                      {/* Custom sections */}
                      {activeSectionId.startsWith("custom-") && (
                        <div className="structured-editor-list">
                          <button className="small-action add-entry-top-btn" onClick={() => addCustomSectionEntry(activeSectionId)}>
                            + Add entry
                          </button>
                          {(customSectionContents[activeSectionId] || []).map((entry) => (
                            <div key={entry.id} className="entry-box">
                              <div className="entry-box-header">
                                <span className="entry-box-type">Entry</span>
                                <button className="remove-entry-btn" onClick={() => removeCustomSectionEntry(activeSectionId, entry.id)} title="Remove">✕</button>
                              </div>
                              <input
                                value={entry.title}
                                placeholder="Title"
                                onChange={(e) => updateCustomSectionEntry(activeSectionId, entry.id, "title", e.target.value)}
                              />
                              <div className="editor-toolbar-strip">
                                <button onClick={() => applyRichCommand("bold")}><strong>B</strong></button>
                                <button onClick={() => applyRichCommand("italic")}><em>I</em></button>
                                <button onClick={() => applyRichCommand("underline")}><u>U</u></button>
                                <button onClick={() => applyRichCommand("justifyLeft")}>⬛</button>
                                <button onClick={() => applyRichCommand("justifyCenter")}>≡</button>
                                <button onClick={() => applyRichCommand("justifyRight")}>⬜</button>
                                <button onClick={() => applyRichCommand("insertUnorderedList")}>• List</button>
                                <button onClick={() => document.execCommand("insertOrderedList", false)}>1. List</button>
                                <button onClick={() => applyRichCommand("createLink")}>🔗</button>
                              </div>
                              <textarea
                                className="manual-editor-box"
                                value={entry.content}
                                placeholder="Description…"
                                rows={4}
                                onChange={(e) => updateCustomSectionEntry(activeSectionId, entry.id, "content", e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <footer className="focused-editor-footer">
                        <button className="primary" onClick={saveEditingResume}>Done</button>
                        <button onClick={cancelEditingResume}>Cancel</button>
                      </footer>
                    </section>
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
                                <h2>{previewResume.fullName || "Your Name"}</h2>
                                <p className="preview-text">{previewResume.primaryTitle || "Primary Title"} – {previewResume.specializations[0] || "Specialization 1"} & {previewResume.specializations[1] || "Specialization 2"}</p>
                                <p className="preview-text">{previewResume.email || "email@example.com"} · {previewResume.phone || "(000) 000-0000"} · {previewResume.linkedin || "linkedin.com/in/your-profile"} {previewResume.portfolio ? `· ${previewResume.portfolio}` : ""}</p>
                                {editMode && activeSectionId === section.id ? (
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
                                <p className="preview-text">{previewResume.profile}</p>
                                {editMode && activeSectionId === section.id ? (
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
                                {previewResume.selectedExperience.map((item) => (
                                  <div className="bullet-row" key={item.id}>
                                    <p className="preview-bullet">• {toPlainText(item.text)}</p>
                                  </div>
                                ))}
                                {editMode && activeSectionId === section.id
                                  ? experienceEditor.map((item) => (
                                      <div className="experience-main-box" key={item.id}>
                                        <div className="experience-box-toolbar">
                                          <span>Editing toolbar</span>
                                          <button
                                            className="small-action"
                                            onClick={() =>
                                              setOpenFieldMenuFor((prev) =>
                                                prev === item.id ? null : item.id,
                                              )
                                            }
                                          >
                                            +
                                          </button>
                                        </div>
                                        {openFieldMenuFor === item.id && (
                                          <div className="field-add-menu">
                                            {(["text", "date", "title", "subTitle"] as ExperienceFieldType[]).map((type) => (
                                              <button
                                                key={type}
                                                onClick={() => addExperienceField(item.id, type)}
                                              >
                                                {type === "subTitle" ? "sub title" : type}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                        <div className={`experience-field-grid ${draggingField ? "drag-active" : ""}`}>
                                          {item.fields.map((field, fieldIndex) => (
                                            <div
                                              key={field.id}
                                              className={`experience-sub-box ${field.width === "half" ? "half" : "full"}`}
                                            >
                                              <div className="sub-box-drop-zones">
                                                {(["top", "bottom", "left", "right"] as const).map((zone) => (
                                                  <button
                                                    key={zone}
                                                    className={`drop-zone ${zone} ${dropIndicator?.itemId === item.id && dropIndicator.fieldId === field.id && dropIndicator.position === zone ? "active" : ""}`}
                                                    onDragOver={(e) => {
                                                      e.preventDefault();
                                                      setDropIndicator({ itemId: item.id, fieldId: field.id, position: zone });
                                                    }}
                                                    onDragEnter={(e) => {
                                                      e.preventDefault();
                                                      setDropIndicator({ itemId: item.id, fieldId: field.id, position: zone });
                                                    }}
                                                    onDragLeave={() => {
                                                      setDropIndicator((prev) =>
                                                        prev?.itemId === item.id && prev.fieldId === field.id && prev.position === zone
                                                          ? null
                                                          : prev,
                                                      );
                                                    }}
                                                    onDrop={(e) => {
                                                      e.preventDefault();
                                                      moveExperienceField(item.id, field.id, zone);
                                                    }}
                                                    aria-label={`Drop ${zone}`}
                                                  />
                                                ))}
                                              </div>
                                              <div className="sub-box-header">
                                                <label className="sub-box-label">{field.type === "subTitle" ? "Sub title" : field.type}</label>
                                                <div className="field-actions">
                                                  <button
                                                    type="button"
                                                    className="drag-handle"
                                                    draggable
                                                    onDragStart={(e) => {
                                                      e.stopPropagation();
                                                      setDraggingField({
                                                        itemId: item.id,
                                                        fieldId: field.id,
                                                      });
                                                      setDropIndicator(null);
                                                      e.dataTransfer.effectAllowed = "move";
                                                    }}
                                                    onDragEnd={() => {
                                                      setDraggingField(null);
                                                      setDropIndicator(null);
                                                    }}
                                                    aria-label="Drag to reorder field"
                                                    title="Drag to reorder"
                                                  >
                                                    ⋮⋮
                                                  </button>
                                                  <div className="field-reorder-buttons" role="group" aria-label="Reorder field">
                                                    <button
                                                      type="button"
                                                      className="reorder-btn"
                                                      onClick={() => moveExperienceFieldByOffset(item.id, field.id, "up")}
                                                      disabled={fieldIndex === 0}
                                                      aria-label="Move field up"
                                                    >
                                                      ↑
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="reorder-btn"
                                                      onClick={() => moveExperienceFieldByOffset(item.id, field.id, "down")}
                                                      disabled={fieldIndex === item.fields.length - 1}
                                                      aria-label="Move field down"
                                                    >
                                                      ↓
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                              {field.type === "date" ? (
                                                <input
                                                  type="date"
                                                  className="manual-editor-box"
                                                  value={field.value}
                                                  onDragStart={(e) => e.preventDefault()}
                                                  onChange={(e) =>
                                                    updateExperienceField(item.id, field.id, e.target.value)
                                                  }
                                                />
                                              ) : (
                                                <textarea
                                                  className="manual-editor-box"
                                                  value={field.value}
                                                  rows={field.type === "text" ? 4 : 2}
                                                  placeholder={`Add ${field.type === "subTitle" ? "sub title" : field.type}`}
                                                  onDragStart={(e) => e.preventDefault()}
                                                  onChange={(e) =>
                                                    updateExperienceField(item.id, field.id, e.target.value)
                                                  }
                                                />
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                  : previewResume.selectedExperience.map((item) => (
                                      <div className="bullet-row" key={item.id}>
                                        <p className="preview-bullet">• {toPlainText(item.text)}</p>
                                      </div>
                                    ))}
                                {editMode && (
                                  <button
                                    className="small-action"
                                    onClick={addExperienceMainBox}
                                  >
                                    + Add main box
                                  </button>
                                )}
                              </div>
                            );
                          }
                          if (section.id === "education") {
                            return (
                              <div key={section.id}>
                                <h4>{section.label}</h4>
                                {previewResume.education.map((item) => <p className="preview-text" key={item}>{item}</p>)}
                                {editMode && activeSectionId === section.id ? (
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
                                <p className="preview-text">{previewResume.keySkills.join(" • ")}</p>
                                {editMode && activeSectionId === section.id ? (
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
                                <p className="preview-text">{previewResume.interests.join(" · ")}</p>
                                {editMode && activeSectionId === section.id ? (
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
                          if (section.id === "languages") {
                            return (
                              <div key={section.id}>
                                <h4>{section.label}</h4>
                                <p className="preview-text">{previewResume.languages.join(" · ")}</p>
                                {editMode && activeSectionId === section.id ? (
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
                          }
                          // Custom sections
                          const customEntries = customSectionContents[section.id] || [];
                          return (
                            <div key={section.id}>
                              <h4>{section.label}</h4>
                              {customEntries.map((entry) => (
                                <div key={entry.id}>
                                  {entry.title && <p className="preview-text" style={{ fontWeight: 700, marginBottom: "0.2rem" }}>{entry.title}</p>}
                                  {entry.content && <p className="preview-text">{entry.content}</p>}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="preview-bottom-actions">
                    {!editMode && <button onClick={startEditingResume}>Edit</button>}
                    <button
                      onClick={() => setSectionPickerOpen((prev) => !prev)}
                    >
                      Sections
                    </button>
                    {editMode ? (
                      <>
                        <button className="primary" onClick={saveEditingResume}>Save edits</button>
                        <button onClick={cancelEditingResume}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={startEditingResume}>Edit</button>
                    )}
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

          {byokEnabled && tab === "llmIntegration" && (
            <section className="llm-integration">
              <div className="llm-card">
                <div className="llm-header">
                  <h3>Model API Provider Settings</h3>
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
                  Configure provider routing only. API credentials are managed
                  server-side via Vercel environment variables/secrets and are
                  never stored in browser localStorage.
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
                  <button
                    className={`primary connectivity-btn connectivity-${connectivityStatus}`}
                    onClick={testModelApiConnectivity}
                    disabled={connectivityStatus === "testing"}
                  >
                    {connectivityStatus === "testing"
                      ? "Testing ping…"
                      : "Test model API ping"}
                  </button>
                  {saveMessage && (
                    <p className="save-message" role="status">
                      {saveMessage}
                    </p>
                  )}
                  {connectivityStatus === "error" && connectivityErrorCode && (
                    <p className="connectivity-error" role="status">
                      {connectivityErrorCode}
                    </p>
                  )}
                </div>
              </div>
              <div className="llm-card">
                <h3>Provider hints</h3>
                <ul>
                  <li>
                    Provider credentials are loaded from secure server-side
                    environment variables.
                    <strong>ChatGPT / OpenAI:</strong> keep endpoint empty to
                    use the default OpenAI chat completions URL.
                  </li>
                  <li>
                    <strong>Claude / Anthropic:</strong> set model to a Claude
                    Messages API model; keep credentials in server-side env
                    vars only.
                  </li>
                  <li>
                    <strong>Copilot / Azure OpenAI:</strong> endpoint should be
                    your Azure deployment chat completions URL.
                  </li>
                  <li>
                    <strong>Gemini / Google AI:</strong> include a Gemini model
                    and configure credentials on the server (not in-browser).
                  </li>
                  <li>
                    Choose a provider and optional model override here, then use
                    “Test model API ping” to verify connectivity.
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
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr
                      key={item.id}
                      className={item.status === "churned" ? "history-row-churned" : ""}
                    >
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
                      <td>
                        <select
                          value={item.status}
                          onChange={(e) =>
                            setHistoryStatus(item.id, e.target.value as SubmissionStatus)
                          }
                          className={
                            item.status === "churned"
                              ? "history-status churned"
                              : "history-status"
                          }
                        >
                          <option value="active">Active</option>
                          <option value="churned">Churned</option>
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="history-delete"
                          onClick={() => deleteHistoryItem(item.id)}
                          aria-label={`Delete ${item.role || "submission"}`}
                          title="Delete submission"
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
