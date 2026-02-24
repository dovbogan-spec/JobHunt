import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";
import { AGENT_PROMPTS, type AgentPromptId } from "./agentPrompts";
import { MODEL_CATALOG, getDefaultModel, getModelsForProvider, type LlmProvider as CatalogLlmProvider } from "./config/modelDefinitions";
import { PreviewModal } from "./components/PreviewModal";
import { SettingsMenu } from "./components/SettingsMenu";
import "./App.css";

type TemplateName = "Modern" | "Classic" | "Technical" | "Professional";
type TabName = "resume" | "coverLetter" | "history" | "llmIntegration";
type ProficiencyLevel = "Beginner" | "Intermediate" | "Advanced" | "Expert";
type LanguageLevel =
  | "Beginner (A1)"
  | "Elementary (A2)"
  | "Intermediate (B1)"
  | "Upper-Intermediate (B2)"
  | "Advanced (C1)"
  | "Native / Bilingual (C2)";
type PersonalDetails = {
  fullName: string;
  professionalTitle: string;
  email: string;
  phone: string;
  location: string;
  linkedIn: string;
  portfolio?: string;
};
type ResumeExperienceItem = {
  id: string;
  jobTitle: string;
  employer: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  visible: boolean;
  order: number;
};
type EducationItem = {
  id: string;
  degree: string;
  institution: string;
  startDate: string;
  endDate: string;
  description: string;
};
type ResumeSkillEntry = { id: string; skillName: string; proficiency: ProficiencyLevel };
type ResumeLanguageEntry = { id: string; name: string; level: LanguageLevel };
type SkillEntry = { id: string; name: string; level: string };
type CustomFieldType =
  | "title"
  | "subTitle"
  | "dates"
  | "textParagraph"
  | "textList"
  | "scoreNumeric"
  | "scoreLevel";
type CustomSectionField = {
  id: string;
  type: CustomFieldType;
  label: string;
  value: string;
  secondaryValue?: string;
  items?: string[];
};
type CustomFieldBlueprint = {
  id: string;
  type: CustomFieldType;
  label: string;
};
type InsightTab = "soft" | "hard" | "reviews" | "salary" | "values";
type LlmProvider = CatalogLlmProvider;

type ExperienceItem = {
  id: string;
  text: string;
  company: string;
  skillTags: string[];
  selected: boolean;
};
type ResumeData = {
  personalDetails: PersonalDetails;
  profile: string;
  experience: ResumeExperienceItem[];
  education: EducationItem[];
  skills: ResumeSkillEntry[];
  interests: string[];
  languages: ResumeLanguageEntry[];
  organization: string;
};
type ResumeSection = { id: string; label: string; visible: boolean };

type SortableSectionRowProps = {
  section: ResumeSection;
  active: boolean;
  grabbed: boolean;
  editMode: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onOpenEditor: () => void;
  onEditLabel: () => void;
  onToggleVisibility: () => void;
  onRequestDelete: () => void;
  onUpdateLabel: (label: string) => void;
  editingLabel: boolean;
  setEditingLabel: (value: boolean) => void;
};

function SortableSectionRow({
  section,
  active,
  grabbed,
  editMode,
  onKeyDown,
  onOpenEditor,
  onEditLabel,
  onToggleVisibility,
  onRequestDelete,
  onUpdateLabel,
  editingLabel,
  setEditingLabel,
}: SortableSectionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`section-manager-row reorderable-item ${active && editMode ? "active" : ""} ${!section.visible ? "is-hidden" : ""} ${grabbed || isDragging ? "is-grabbed" : ""}`}
      tabIndex={0}
      aria-grabbed={grabbed || isDragging}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={`section-drag-handle ${isDragging ? "is-dragging" : ""}`}
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        {Array.from({ length: 6 }).map((_, dotIndex) => (
          <span key={`${section.id}-dot-${dotIndex}`} aria-hidden="true" className="section-drag-dot" />
        ))}
      </button>
      <button
        className="section-pencil-btn"
        onClick={(e) => {
          e.stopPropagation();
          onEditLabel();
          onOpenEditor();
        }}
        title={`Edit ${section.label}`}
        aria-label={`Edit ${section.label} section`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 20h4l10.2-10.2a1.8 1.8 0 0 0 0-2.6l-1.4-1.4a1.8 1.8 0 0 0-2.6 0L4 16v4Z" />
          <path d="m12.7 7.3 4 4" />
        </svg>
      </button>
      {editingLabel && !editMode ? (
        <input
          className="section-label-edit-input"
          value={section.label}
          autoFocus
          onChange={(e) => onUpdateLabel(e.target.value)}
          onBlur={() => setEditingLabel(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditingLabel(false)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="section-row-label" role="button" tabIndex={0} onClick={onOpenEditor} onKeyDown={(e) => e.key === "Enter" && onOpenEditor()}>
          {section.label || "Untitled section"}
        </span>
      )}
      <div className="section-row-actions">
        <button
          className="section-visibility-btn"
          onClick={onToggleVisibility}
          title={section.visible ? "Hide section" : "Show section"}
          aria-label={section.visible ? `Hide ${section.label} section` : `Show ${section.label} section`}
        >
          {section.visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M1.8 12s3.7-6 10.2-6 10.2 6 10.2 6-3.7 6-10.2 6S1.8 12 1.8 12Z" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3 3 21 21" />
              <path d="M10.5 6.3A11.8 11.8 0 0 1 12 6c6.5 0 10.2 6 10.2 6a18.4 18.4 0 0 1-2.8 3.5" />
              <path d="M6.4 8.1A18.6 18.6 0 0 0 1.8 12S5.5 18 12 18c1.8 0 3.3-.5 4.7-1.1" />
              <path d="M9.9 9.8a3.2 3.2 0 0 0 4.3 4.3" />
            </svg>
          )}
        </button>
        <button
          className="section-delete-btn"
          onClick={onRequestDelete}
          title={`Delete ${section.label}`}
          aria-label={`Delete ${section.label} section`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 7h16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M6 7l1 12h10l1-12" />
            <path d="M9 7V5h6v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
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
type ResumeDraftSnapshot = {
  resume: ResumeData;
  editorDraft: ResumeData;
  personalDetailFields: PersonalDetails;
  skillEntries: SkillEntry[];
  customSectionContents: Record<string, CustomSectionField[]>;
  sections: ResumeSection[];
  activeSectionId: string;
  editMode: boolean;
};
type DragState = { listId: string; itemId: string } | null;
type GrabState = { listId: string; itemId: string; label: string } | null;

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
const RESUME_DRAFT_STORAGE_KEY = "job-hunt-resume-draft";
const providerLabels: Record<LlmProvider, string> = Object.fromEntries(
  (Object.keys(MODEL_CATALOG) as LlmProvider[]).map((p) => [p, MODEL_CATALOG[p].label]),
) as Record<LlmProvider, string>;
const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  title: "Title",
  subTitle: "Sub-title",
  dates: "Dates",
  textParagraph: "Text (paragraph)",
  textList: "Text (list)",
  scoreNumeric: "Score (1–5)",
  scoreLevel: "Score (Low/Medium/High)",
};

const DEFAULT_SECTION_TEMPLATES: {
  id: string;
  label: string;
  fieldTypes: CustomFieldType[];
}[] = [
  { id: "personal-details", label: "Personal details", fieldTypes: ["title", "subTitle", "textParagraph"] },
  { id: "profile", label: "Profile", fieldTypes: ["title", "textParagraph"] },
  { id: "professional-experience", label: "Professional experience", fieldTypes: ["title", "subTitle", "dates", "textList"] },
  { id: "skills", label: "Skills", fieldTypes: ["title", "scoreNumeric", "scoreLevel"] },
  { id: "education", label: "Education", fieldTypes: ["title", "subTitle", "dates", "textParagraph"] },
  { id: "languages", label: "Languages", fieldTypes: ["title", "scoreLevel"] },
];

const initialResume: ResumeData = {
  personalDetails: {
    fullName: "",
    professionalTitle: "",
    email: "",
    phone: "",
    location: "",
    linkedIn: "",
    portfolio: "",
  },
  profile: "",
  experience: [],
  skills: [
    { id: uuidv4(), skillName: "Applied AI & Machine Learning", proficiency: "Advanced" },
    { id: uuidv4(), skillName: "React + TypeScript", proficiency: "Advanced" },
    { id: uuidv4(), skillName: "System Design", proficiency: "Intermediate" },
  ],
  education: [
    {
      id: uuidv4(),
      degree: "BSc, Computer Science",
      institution: "Your University",
      startDate: "",
      endDate: "",
      description: "",
    },
  ],
  interests: ["Product strategy", "Open source", "Mentoring"],
  languages: [{ id: uuidv4(), name: "English", level: "Advanced (C1)" }],
  organization: "",
};
const defaultLlmSettings: LlmSettings = {
  enabled: false,
  provider: "openai",
  model: getDefaultModel("openai"),
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

const LANGUAGE_LEVEL_OPTIONS: Array<{ value: LanguageLevel; shortLabel: string }> = [
  { value: "Beginner (A1)", shortLabel: "Beginner" },
  { value: "Elementary (A2)", shortLabel: "Elementary" },
  { value: "Intermediate (B1)", shortLabel: "Intermediate" },
  { value: "Upper-Intermediate (B2)", shortLabel: "Upper-Intermediate" },
  { value: "Advanced (C1)", shortLabel: "Advanced" },
  { value: "Native / Bilingual (C2)", shortLabel: "Native / Bilingual" },
];
const DEFAULT_LANGUAGE_LEVEL: LanguageLevel = "Intermediate (B1)";

function normalizeLanguageLevel(level: unknown): LanguageLevel {
  const raw = String(level || "").trim();
  const aliases: Record<string, LanguageLevel> = {
    "basic": "Beginner (A1)",
    "beginner": "Beginner (A1)",
    "beginner (a1)": "Beginner (A1)",
    "elementary": "Elementary (A2)",
    "elementary (a2)": "Elementary (A2)",
    "conversational": "Intermediate (B1)",
    "intermediate": "Intermediate (B1)",
    "intermediate (b1)": "Intermediate (B1)",
    "upper-intermediate": "Upper-Intermediate (B2)",
    "upper-intermediate (b2)": "Upper-Intermediate (B2)",
    "proficient": "Advanced (C1)",
    "advanced": "Advanced (C1)",
    "advanced (c1)": "Advanced (C1)",
    "fluent": "Advanced (C1)",
    "native/bilingual": "Native / Bilingual (C2)",
    "native / bilingual": "Native / Bilingual (C2)",
    "native / bilingual (c2)": "Native / Bilingual (C2)",
  };
  return aliases[raw.toLowerCase()] || DEFAULT_LANGUAGE_LEVEL;
}

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
      resume: migrateResumeData(item.resume),
      status: item.status === "churned" ? "churned" : "active",
    };
  });
}

function readDraftSnapshot(): ResumeDraftSnapshot | null {
  const raw = localStorage.getItem(RESUME_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ResumeDraftSnapshot;
  } catch {
    return null;
  }
}

function migrateResumeData(value: unknown): ResumeData {
  if (!value || typeof value !== "object") return initialResume;
  const source = value as Record<string, unknown>;
  const personalDetailsSource =
    (source.personalDetails as Record<string, unknown> | undefined) || {};

  const fullName = String(personalDetailsSource.fullName || source.fullName || "");
  const professionalTitle = String(
    personalDetailsSource.professionalTitle || source.primaryTitle || "",
  );
  const email = String(personalDetailsSource.email || source.email || "");
  const phone = String(personalDetailsSource.phone || source.phone || "");
  const linkedIn = String(personalDetailsSource.linkedIn || source.linkedin || "");
  const portfolio = String(personalDetailsSource.portfolio || source.portfolio || "");
  const location = String(personalDetailsSource.location || "");

  const oldExperience = Array.isArray(source.selectedExperience)
    ? (source.selectedExperience as ExperienceItem[])
    : [];
  const experience = Array.isArray(source.experience)
    ? (source.experience as ResumeExperienceItem[])
    : oldExperience.map((item, index) => ({
        id: item.id || uuidv4(),
        jobTitle: "",
        employer: item.company || "",
        startDate: "",
        endDate: "",
        location: "",
        description: item.text || "",
        visible: item.selected ?? true,
        order: index,
      }));

  const education = Array.isArray(source.education)
    ? (source.education as Array<EducationItem | string>).map((item) =>
        typeof item === "string"
          ? {
              id: uuidv4(),
              degree: item,
              institution: "",
              startDate: "",
              endDate: "",
              description: "",
            }
          : {
              id: item.id || uuidv4(),
              degree: item.degree || "",
              institution: item.institution || "",
              startDate: item.startDate || "",
              endDate: item.endDate || "",
              description: item.description || "",
            },
      )
    : [];

  const skills = Array.isArray(source.skills)
    ? (source.skills as ResumeSkillEntry[])
    : Array.isArray(source.keySkills)
      ? (source.keySkills as string[]).map((skill) => ({
          id: uuidv4(),
          skillName: skill,
          proficiency: "Advanced" as ProficiencyLevel,
        }))
      : [];

  const languages = Array.isArray(source.languages)
    ? (source.languages as Array<ResumeLanguageEntry | string>).map((item) => {
        if (typeof item !== "string") {
          const legacyItem = item as ResumeLanguageEntry & { language?: string };
          return {
            id: item.id || uuidv4(),
            name: legacyItem.name || legacyItem.language || "",
            level: normalizeLanguageLevel(item.level),
          } satisfies ResumeLanguageEntry;
        }
        const [name, level] = item.split("—").map((part) => part.trim());
        return {
          id: uuidv4(),
          name: name || item,
          level: normalizeLanguageLevel(level),
        };
      })
    : [];

  return {
    personalDetails: {
      fullName,
      professionalTitle,
      email,
      phone,
      location,
      linkedIn,
      portfolio,
    },
    profile: String(source.profile || ""),
    experience,
    education,
    skills,
    interests: Array.isArray(source.interests)
      ? source.interests.map((item) => String(item)).filter(Boolean)
      : [],
    languages,
    organization: String(source.organization || ""),
  };
}

function makeCustomSectionField(type: CustomFieldType, label?: string): CustomSectionField {
  const baseLabel = label || CUSTOM_FIELD_TYPE_LABELS[type];
  if (type === "textList") {
    return { id: uuidv4(), type, label: baseLabel, value: "", items: [""] };
  }
  if (type === "dates") {
    return {
      id: uuidv4(),
      type,
      label: baseLabel,
      value: "",
      secondaryValue: "",
    };
  }
  if (type === "scoreNumeric") {
    return { id: uuidv4(), type, label: baseLabel, value: "3" };
  }
  if (type === "scoreLevel") {
    return { id: uuidv4(), type, label: baseLabel, value: "Medium" };
  }
  return { id: uuidv4(), type, label: baseLabel, value: "" };
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function moveArrayItemById<T extends { id: string }>(items: T[], fromId: string, toId: string): T[] {
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const toIndex = items.findIndex((item) => item.id === toId);
  return moveArrayItem(items, fromIndex, toIndex);
}

function ModelStatusBadge({ status }: { status: ConnectivityStatus | undefined }) {
  if (status === "success") return <span className="model-status-ok" aria-label="connected">✓</span>;
  if (status === "error") return <span className="model-status-err" aria-label="not connected">✗</span>;
  if (status === "testing") return <span className="model-status-testing" aria-label="testing">…</span>;
  return null;
}

type ModelPickerProps = {
  provider: LlmProvider;
  open: boolean;
  statusMap: Partial<Record<LlmProvider, ConnectivityStatus>>;
  onToggle: () => void;
  onSelect: (provider: LlmProvider) => void;
};

function ModelPickerDropdown({ provider, open, statusMap, onToggle, onSelect }: ModelPickerProps) {
  const providers = (Object.keys(MODEL_CATALOG) as LlmProvider[]).filter((p) => p !== "custom");
  return (
    <div className="model-picker-wrapper">
      <button
        className={"small-action model-picker-btn" + (open ? " active" : "")}
        onClick={onToggle}
        title="Switch AI model"
      >
        {"🤖 " + providerLabels[provider] + " "}
        <ModelStatusBadge status={statusMap[provider]} />
      </button>
      {open && (
        <div className="model-picker-dropdown">
          {providers.map((p) => (
            <button
              key={p}
              className={"model-picker-option" + (provider === p ? " selected" : "")}
              onClick={() => onSelect(p)}
            >
              <span className="model-picker-label">{providerLabels[p]}</span>
              <ModelStatusBadge status={statusMap[p]} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const initialDraftSnapshot = readDraftSnapshot();
  const [tab, setTab] = useState<TabName>("resume");
  const [jobText, setJobText] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [experienceDoc, setExperienceDoc] = useState("");
  const [experienceItems, setExperienceItems] = useState<ExperienceItem[]>([]);
  const [resume, setResume] = useState<ResumeData>(
    initialDraftSnapshot?.resume ?? initialResume,
  );
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
  const [_zoom, _setZoom] = useState(1);
  const [editMode, setEditMode] = useState(initialDraftSnapshot?.editMode ?? false);
  const [editorDraft, setEditorDraft] = useState<ResumeData>(
    initialDraftSnapshot?.editorDraft ?? initialDraftSnapshot?.resume ?? initialResume,
  );
  const [_experienceEditor, _setExperienceEditor] = useState<ExperienceEditorItem[]>([]);
  const [_draggingSection, _setDraggingSection] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<DragState>(null);
  const [activeSectionDragId, setActiveSectionDragId] = useState<string | null>(null);
  const [grabState, setGrabState] = useState<GrabState>(null);
  const [pendingLanguageFocusId, setPendingLanguageFocusId] = useState<string | null>(null);
  const [reorderLiveMessage, setReorderLiveMessage] = useState("");
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [personalDetailFields, setPersonalDetailFields] = useState<PersonalDetails>(
    initialDraftSnapshot?.personalDetailFields ?? editorDraft.personalDetails,
  );
  const [skillEntries, _setSkillEntries] = useState<SkillEntry[]>(
    initialDraftSnapshot?.skillEntries ?? [],
  );
  const [customSectionContents, setCustomSectionContents] = useState<Record<string, CustomSectionField[]>>(
    (initialDraftSnapshot?.customSectionContents ?? {}) as Record<string, CustomSectionField[]>,
  );
  const [addSectionModalOpen, setAddSectionModalOpen] = useState(false);
  const [pendingDeleteSection, setPendingDeleteSection] = useState<ResumeSection | null>(null);
  const [sectionCreationMode, setSectionCreationMode] = useState<"template" | "custom">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_SECTION_TEMPLATES[0].id);
  const [customSectionTitleDraft, setCustomSectionTitleDraft] = useState("New Section");
  const [customFieldBlueprints, setCustomFieldBlueprints] = useState<CustomFieldBlueprint[]>([]);
  const [_sectionPickerOpen, _setSectionPickerOpen] = useState(false);
  const [_sectionListCollapsed, _setSectionListCollapsed] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [isJobSectionCollapsed, setIsJobSectionCollapsed] = useState(false);
  const [hasGeneratedResume, setHasGeneratedResume] = useState(false);
  const [showIntake, setShowIntake] = useState(true);
  const [sections, setSections] = useState<ResumeSection[]>(
    initialDraftSnapshot?.sections ?? initialSections,
  );
  const [activeSectionId, setActiveSectionId] = useState<string>(
    initialDraftSnapshot?.activeSectionId ??
      initialSections.find((section) => section.visible)?.id ??
      initialSections[0].id,
  );
  const [savedSectionId, setSavedSectionId] = useState<string | null>(null);
  const [requirementChecks, setRequirementChecks] = useState<
    RequirementCheck[]
  >([]);
  const [analyzingRequirements, setAnalyzingRequirements] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
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
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  useEffect(() => {
    if (!pendingLanguageFocusId) return;
    const target = document.querySelector<HTMLInputElement>(`[data-language-name-id="${pendingLanguageFocusId}"]`);
    if (target) {
      target.focus();
      setPendingLanguageFocusId(null);
    }
  }, [editorDraft.languages, pendingLanguageFocusId]);
  const [modelStatusMap, setModelStatusMap] = useState<Partial<Record<LlmProvider, ConnectivityStatus>>>({});
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const richTextEditorRef = useRef<HTMLDivElement | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const previewResume = editMode ? editorDraft : resume;
  const activeSection = sections.find((section) => section.id === activeSectionId);
  const sectionDragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleSectionDragStart(event: DragStartEvent) {
    setActiveSectionDragId(String(event.active.id));
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveSectionDragId(null);
    if (!over || active.id === over.id) return;
    const fromIndex = sections.findIndex((section) => section.id === active.id);
    const toIndex = sections.findIndex((section) => section.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    moveSections(fromIndex, toIndex);
    announceReorder(`Moved section to position ${toIndex + 1} of ${sections.length}.`);
  }

  function handleSectionDragCancel() {
    setActiveSectionDragId(null);
  }

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
    if (!pendingDeleteSection) return;
    deleteCancelButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingDeleteSection(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingDeleteSection]);
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

  function buildCanonicalResume(): ResumeData {
    return {
      ...editorDraft,
      personalDetails: personalDetailFields,
    };
  }

  function persistDraftSnapshot(
    nextResume: ResumeData,
    nextEditMode: boolean,
    overrides?: Partial<Pick<ResumeDraftSnapshot, "sections" | "activeSectionId" | "customSectionContents">>,
  ) {
    const snapshot: ResumeDraftSnapshot = {
      resume: nextResume,
      editorDraft,
      personalDetailFields,
      skillEntries,
      customSectionContents: overrides?.customSectionContents ?? customSectionContents,
      sections: overrides?.sections ?? sections,
      activeSectionId: overrides?.activeSectionId ?? activeSectionId,
      editMode: nextEditMode,
    };
    localStorage.setItem(RESUME_DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
  }

  function commitEditorChanges(sectionId: string, nextEditMode = true) {
    const nextResume = buildCanonicalResume();
    setResume(nextResume);
    persistDraftSnapshot(nextResume, nextEditMode);
    setSavedSectionId(sectionId);
  }

  useEffect(() => {
    if (!savedSectionId) return;
    const timer = window.setTimeout(() => setSavedSectionId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [savedSectionId]);

  useEffect(() => {
    if (!editMode) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      commitEditorChanges(activeSectionId);
    }, 600);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    activeSectionId,
    customSectionContents,
    editMode,
    editorDraft,
    personalDetailFields,
    sections,
    skillEntries,
  ]);

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

  function switchProvider(provider: LlmProvider) {
    setLlmSettings((prev) => ({
      ...prev,
      provider,
      model: getDefaultModel(provider),
      endpoint: MODEL_CATALOG[provider].defaultEndpoint,
    }));
  }

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
      setModelStatusMap((prev) => ({ ...prev, [provider]: "success" }));
    } catch (error) {
      setConnectivityStatus("error");
      setConnectivityErrorCode(
        error instanceof Error ? error.message : "PING_FAILED",
      );
      const { provider } = getLlmConnectionInfo(llmSettings);
      setModelStatusMap((prev) => ({ ...prev, [provider]: "error" }));
    }
  }

  async function pingProvider(provider: LlmProvider): Promise<boolean> {
    const model = getDefaultModel(provider);
    try {
      const response = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, messages: [{ role: "user", content: "ping" }] }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function pingAllProviders() {
    const providers = (Object.keys(MODEL_CATALOG) as LlmProvider[]).filter((p) => p !== "custom");
    setModelStatusMap((prev) => {
      const next = { ...prev };
      for (const p of providers) next[p] = "testing";
      return next;
    });
    const results = await Promise.all(providers.map((p) => pingProvider(p)));
    setModelStatusMap((prev) => {
      const next = { ...prev };
      providers.forEach((p, i) => { next[p] = results[i] ? "success" : "error"; });
      return next;
    });
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
        role: resume.personalDetails.professionalTitle,
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
        personalDetails: {
          fullName: info.fullName || "Your Name",
          professionalTitle: String(
            (draft.targetRole as string | undefined) ||
              (job.snapshot as { title?: string } | undefined)?.title ||
              "Target Role",
          ),
          email: info.email,
          phone: info.phone,
          location: "",
          linkedIn: "linkedin.com/in/your-profile",
          portfolio: "github.com/your-handle",
        },
        profile: String(
          (draft.summary as string | undefined) ||
            "Tailored summary generated by matcher agent.",
        ),
        skills: (((draft.selectedSkills as string[] | undefined) ||
          (job.mustHaves as string[] | undefined) ||
          []).slice(0, 12)).map((skill) => ({ id: uuidv4(), skillName: skill, proficiency: "Advanced" })),
        education: [{ id: uuidv4(), degree: "BSc, Computer Science", institution: "Your University", startDate: "", endDate: "", description: "" }],
        interests: ["Product strategy", "Open source", "Mentoring"],
        languages: [{ id: uuidv4(), name: "English", level: "Advanced (C1)" }],
        experience: parsed.map((item, i) => ({
          id: item.id,
          jobTitle: "",
          employer: item.company,
          startDate: "",
          endDate: "",
          location: "",
          description: ((draft.tailoredExperience as string[] | undefined) || [])[i] || item.text,
          visible: true,
          order: i,
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
      skills: (((patchedDraft.selectedSkills as string[] | undefined) || prev.skills.map((skill) => skill.skillName)).slice(0, 12)).map((skill, index) => ({
        id: prev.skills[index]?.id || uuidv4(),
        skillName: skill,
        proficiency: prev.skills[index]?.proficiency || "Advanced",
      })),
    }));
    setChatMessages((prev) => [
      ...prev,
      "Agent 6 integrated your context and sent an update back to Agent 4. CV has been refreshed.",
    ]);
  }

  function applySelectedExperience() {
    setResume((prev) => ({
      ...prev,
      experience: experienceItems
        .filter((item) => item.selected)
        .map((item, index) => ({
          id: item.id,
          jobTitle: "",
          employer: item.company,
          startDate: "",
          endDate: "",
          location: "",
          description: item.text,
          visible: true,
          order: index,
        })),
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
  function announceReorder(message: string) {
    setReorderLiveMessage(message);
  }

  function moveSections(fromIndex: number, toIndex: number) {
    setSections((prev) => moveArrayItem(prev, fromIndex, toIndex));
  }

  function moveDraftListEntries(key: "education" | "languages" | "interests", fromIndex: number, toIndex: number) {
    if (key === "education") {
      setEditorDraft((prev) => ({ ...prev, education: moveArrayItem(prev.education, fromIndex, toIndex) }));
    } else if (key === "languages") {
      setEditorDraft((prev) => ({ ...prev, languages: moveArrayItem(prev.languages, fromIndex, toIndex) }));
    } else {
      setEditorDraft((prev) => ({ ...prev, interests: moveArrayItem(prev.interests, fromIndex, toIndex) }));
    }
  }

  function moveCustomSectionEntry(sectionId: string, fromIndex: number, toIndex: number) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: moveArrayItem(prev[sectionId] || [], fromIndex, toIndex),
    }));
  }

  function handleReorderKeyDown(
    event: KeyboardEvent<HTMLElement>,
    params: {
      listId: string;
      itemId: string;
      index: number;
      total: number;
      label: string;
      onMove: (fromIndex: number, toIndex: number) => void;
    },
  ) {
    const { listId, itemId, index, total, label, onMove } = params;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (grabState?.listId === listId && grabState.itemId === itemId) {
        setGrabState(null);
        announceReorder(`Dropped ${label}.`);
        return;
      }
      setGrabState({ listId, itemId, label });
      announceReorder(`Grabbed ${label}. Use arrow keys to move and Enter or Space to drop.`);
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!(grabState?.listId === listId && grabState.itemId === itemId)) return;

    event.preventDefault();
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const toIndex = Math.max(0, Math.min(total - 1, index + direction));
    if (toIndex === index) return;
    onMove(index, toIndex);
    announceReorder(`Moved ${label} to position ${toIndex + 1} of ${total}.`);
  }
  function openAddSectionModal() {
    setAddSectionModalOpen(true);
    setSectionCreationMode("template");
    setSelectedTemplateId(DEFAULT_SECTION_TEMPLATES[0].id);
    setCustomSectionTitleDraft("New Section");
    setCustomFieldBlueprints([]);
  }
  function addBlueprintField(type: CustomFieldType) {
    setCustomFieldBlueprints((prev) => [
      ...prev,
      { id: uuidv4(), type, label: CUSTOM_FIELD_TYPE_LABELS[type] },
    ]);
  }
  function updateBlueprintLabel(id: string, label: string) {
    setCustomFieldBlueprints((prev) => prev.map((field) => (field.id === id ? { ...field, label } : field)));
  }
  function moveBlueprintField(id: string, direction: -1 | 1) {
    setCustomFieldBlueprints((prev) => {
      const currentIndex = prev.findIndex((field) => field.id === id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }
  function removeBlueprintField(id: string) {
    setCustomFieldBlueprints((prev) => prev.filter((field) => field.id !== id));
  }
  function createSectionFromAddModal() {
    const id = `custom-${uuidv4()}`;
    if (sectionCreationMode === "template") {
      const template = DEFAULT_SECTION_TEMPLATES.find((entry) => entry.id === selectedTemplateId) || DEFAULT_SECTION_TEMPLATES[0];
      setSections((prev) => [...prev, { id, label: template.label, visible: true }]);
      setCustomSectionContents((prev) => ({
        ...prev,
        [id]: template.fieldTypes.map((type) => makeCustomSectionField(type)),
      }));
    } else {
      const builtFields = customFieldBlueprints.length
        ? customFieldBlueprints.map((field) => makeCustomSectionField(field.type, field.label.trim() || CUSTOM_FIELD_TYPE_LABELS[field.type]))
        : [makeCustomSectionField("textParagraph")];
      setSections((prev) => [...prev, { id, label: customSectionTitleDraft.trim() || "New Section", visible: true }]);
      setCustomSectionContents((prev) => ({
        ...prev,
        [id]: builtFields,
      }));
    }
    setAddSectionModalOpen(false);
    openSectionEditor(id);
    setEditingLabelId(id);
  }
  function requestDeleteSection(section: ResumeSection) {
    setPendingDeleteSection(section);
  }
  function confirmDeleteSection() {
    if (!pendingDeleteSection) return;
    const sectionId = pendingDeleteSection.id;
    const nextSections = sections.filter((section) => section.id !== sectionId);
    const nextCustomSectionContents = Object.fromEntries(
      Object.entries(customSectionContents).filter(([key]) => key !== sectionId),
    );
    const nextActiveSectionId = activeSectionId === sectionId
      ? nextSections.find((section) => section.visible)?.id ?? nextSections[0]?.id ?? ""
      : activeSectionId;
    const nextEditMode = activeSectionId === sectionId ? false : editMode;

    setSections(nextSections);
    setCustomSectionContents(nextCustomSectionContents);
    if (activeSectionId === sectionId) {
      if (nextActiveSectionId) {
        setActiveSectionId(nextActiveSectionId);
      }
      setEditMode(false);
      setEditingLabelId(null);
    }
    persistDraftSnapshot(buildCanonicalResume(), nextEditMode, {
      sections: nextSections,
      activeSectionId: nextActiveSectionId,
      customSectionContents: nextCustomSectionContents,
    });
    setPendingDeleteSection(null);
  }
  function cancelDeleteSection() {
    setPendingDeleteSection(null);
  }
  function openSectionEditor(id: string) {
    if (!editMode) {
      const migrated = migrateResumeData(resume);
      setEditorDraft(migrated);
      setPersonalDetailFields(migrated.personalDetails);
    }
    setActiveSectionId(id);
    setEditMode(true);
  }
  function updatePersonalDetailField(field: keyof PersonalDetails, value: string) {
    setPersonalDetailFields((prev) => ({ ...prev, [field]: value }));
    setEditorDraft((prev) => ({
      ...prev,
      personalDetails: { ...prev.personalDetails, [field]: value },
    }));
  }
  function addSkillEntry() {
    setEditorDraft((prev) => ({
      ...prev,
      skills: [...prev.skills, { id: uuidv4(), skillName: "", proficiency: "Intermediate" }],
    }));
  }
  function updateSkillEntry(id: string, field: keyof ResumeSkillEntry, value: string) {
    setEditorDraft((prev) => ({
      ...prev,
      skills: prev.skills.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    }));
  }
  function removeSkillEntry(id: string) {
    setEditorDraft((prev) => ({ ...prev, skills: prev.skills.filter((entry) => entry.id !== id) }));
  }
  function addCustomSectionField(sectionId: string, type: CustomFieldType) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] || []), makeCustomSectionField(type)],
    }));
  }
  function updateCustomSectionField(sectionId: string, fieldId: string, patch: Partial<CustomSectionField>) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }));
  }
  function updateCustomSectionListItem(sectionId: string, fieldId: string, itemIndex: number, value: string) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map((field) => {
        if (field.id !== fieldId) return field;
        const nextItems = [...(field.items || [""])];
        nextItems[itemIndex] = value;
        return { ...field, items: nextItems };
      }),
    }));
  }
  function addCustomSectionListItem(sectionId: string, fieldId: string) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map((field) =>
        field.id === fieldId ? { ...field, items: [...(field.items || []), ""] } : field,
      ),
    }));
  }
  function removeCustomSectionListItem(sectionId: string, fieldId: string, itemIndex: number) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map((field) => {
        if (field.id !== fieldId) return field;
        return { ...field, items: (field.items || []).filter((_, i) => i !== itemIndex) };
      }),
    }));
  }
  function removeCustomSectionField(sectionId: string, fieldId: string) {
    setCustomSectionContents((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).filter((field) => field.id !== fieldId),
    }));
  }
  function saveEditingResume() {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    commitEditorChanges(activeSectionId, false);
    setResume({
      ...editorDraft,
      personalDetails: personalDetailFields,
    });
    setEditMode(false);
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

  function updateInterestOrLanguageField(
    key: "interests" | "languages",
    index: number,
    value: string,
  ) {
    setEditorDraft((prev) => {
      if (key === "interests") {
        return {
          ...prev,
          interests: prev.interests.map((item, itemIndex) =>
            itemIndex === index ? value : item,
          ),
        };
      }
      return {
        ...prev,
        languages: prev.languages.map((item, itemIndex) =>
          itemIndex === index ? { ...item, name: value } : item,
        ),
      };
    });
  }

  function updateLanguageLevel(index: number, level: LanguageLevel) {
    setEditorDraft((prev) => ({
      ...prev,
      languages: prev.languages.map((item, itemIndex) => (itemIndex === index ? { ...item, level } : item)),
    }));
  }

  function removeLanguage(index: number) {
    setEditorDraft((prev) => ({
      ...prev,
      languages: prev.languages.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function appendListField(key: "education" | "interests" | "languages") {
    setEditorDraft((prev) => {
      if (key === "education") {
        return {
          ...prev,
          education: [...prev.education, { id: uuidv4(), degree: "", institution: "", startDate: "", endDate: "", description: "" }],
        };
      }
      if (key === "languages") {
        const languageId = uuidv4();
        setPendingLanguageFocusId(languageId);
        return {
          ...prev,
          languages: [...prev.languages, { id: languageId, name: "", level: DEFAULT_LANGUAGE_LEVEL }],
        };
      }
      return { ...prev, interests: [...prev.interests, ""] };
    });
  }
  function toPlainText(value: string) {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function generateCoverLetter() {
    setCoverLetter(
      `Dear Hiring Team at ${resume.organization || "the company"},\n\nI am excited to apply for the ${resume.personalDetails.professionalTitle || "open role"}. I bring strengths in ${resume.skills.slice(0, 5).map((skill) => skill.skillName).join(", ")} and have delivered:\n${resume.experience
        .slice(0, 3)
        .map((item) => `• ${toPlainText(item.description)}`)
        .join(
          "\n",
        )}\n\n${coverLetterNotes ? `${coverLetterNotes}\n\n` : ""}Sincerely,\n${resume.personalDetails.fullName || "Candidate"}`,
    );
  }

  function downloadResumePdf() {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text(resume.personalDetails.fullName || "Your Name", 14, y);
    y += 8;
    doc.setFontSize(11);
    doc.text(`${resume.personalDetails.email} | ${resume.personalDetails.phone} | ${resume.personalDetails.linkedIn}`, 14, y);
    y += 8;
    doc.text(`Target Role: ${resume.personalDetails.professionalTitle}`, 14, y);
    y += 8;
    doc.text(toPlainText(resume.profile), 14, y, { maxWidth: 180 });
    y += 16;
    doc.text(`Skills: ${resume.skills.map((skill) => `${skill.skillName} (${skill.proficiency})`).join(", ")}`, 14, y, {
      maxWidth: 180,
    });
    y += 12;
    resume.experience.forEach((item) => {
      doc.text(`• ${toPlainText(item.description)}`, 14, y, { maxWidth: 180 });
      y += 7;
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
    });
    doc.save(`${(resume.personalDetails.fullName || "resume").replace(/\s+/g, "_")}.pdf`);
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
        personalDetails: {
          ...prev.personalDetails,
          fullName: info.fullName || prev.personalDetails.fullName,
          email: info.email || prev.personalDetails.email,
          phone: info.phone || prev.personalDetails.phone,
        },
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

  const renderResumePreviewContent = () => (
    sections
      .filter((section) => section.visible)
      .map((section) => {
        if (section.id === "header") {
          return (
            <div
              key={section.id}
              className="preview-section-clickable"
              role="button"
              tabIndex={0}
              onClick={() => openSectionEditor(section.id)}
              onKeyDown={(e) => e.key === "Enter" && openSectionEditor(section.id)}
              title="Click to edit"
            >
              <h2>
                {previewResume.personalDetails.fullName || "Your Name"}
                <span className="preview-section-pencil" onClick={(e) => { e.stopPropagation(); setEditingLabelId(section.id); openSectionEditor(section.id); }}>✏️</span>
              </h2>
              <p className="preview-text">{previewResume.personalDetails.professionalTitle || "Professional Title"}</p>
              <p className="preview-text">{previewResume.personalDetails.email || "email@example.com"} · {previewResume.personalDetails.phone || "(000) 000-0000"} · {previewResume.personalDetails.linkedIn || "linkedin.com/in/your-profile"} {previewResume.personalDetails.portfolio ? `· ${previewResume.personalDetails.portfolio}` : ""}</p>
            </div>
          );
        }
        if (section.id === "profile") {
          return (
            <div key={section.id}>
              <h4>{section.label}</h4>
              <p className="preview-text">{previewResume.profile}</p>
            </div>
          );
        }
        if (section.id === "experience") {
          return (
            <div
              key={section.id}
              className="preview-section-clickable"
              role="button"
              tabIndex={0}
              onClick={() => openSectionEditor(section.id)}
              onKeyDown={(e) => e.key === "Enter" && openSectionEditor(section.id)}
              title="Click to edit"
            >
              <h4>
                {section.label}
                <span className="preview-section-pencil" onClick={(e) => { e.stopPropagation(); setEditingLabelId(section.id); openSectionEditor(section.id); }}>✏️</span>
              </h4>
              {previewResume.experience.filter((item) => item.visible).sort((a, b) => a.order - b.order).map((item) => (
                <div className="bullet-row" key={item.id}>
                  <p className="preview-text"><strong>{item.jobTitle}</strong> · {item.employer}</p>
                  <p className="preview-text">{item.startDate} - {item.endDate} {item.location ? `· ${item.location}` : ""}</p>
                  <p className="preview-bullet">• {toPlainText(item.description)}</p>
                </div>
              ))}
            </div>
          );
        }
        if (section.id === "education") {
          return (
            <div
              key={section.id}
              className="preview-section-clickable"
              role="button"
              tabIndex={0}
              onClick={() => openSectionEditor(section.id)}
              onKeyDown={(e) => e.key === "Enter" && openSectionEditor(section.id)}
              title="Click to edit"
            >
              <h4>
                {section.label}
                <span className="preview-section-pencil" onClick={(e) => { e.stopPropagation(); setEditingLabelId(section.id); openSectionEditor(section.id); }}>✏️</span>
              </h4>
              {previewResume.education.map((item) => (
                <div className="bullet-row" key={item.id}>
                  <p className="preview-text"><strong>{item.degree}</strong> · {item.institution}</p>
                  <p className="preview-text">{item.startDate} - {item.endDate}</p>
                  <p className="preview-bullet">• {toPlainText(item.description)}</p>
                </div>
              ))}
            </div>
          );
        }
        if (section.id === "skills") {
          return (
            <div
              key={section.id}
              className="preview-section-clickable"
              role="button"
              tabIndex={0}
              onClick={() => openSectionEditor(section.id)}
              onKeyDown={(e) => e.key === "Enter" && openSectionEditor(section.id)}
              title="Click to edit"
            >
              <h4>
                {section.label}
                <span className="preview-section-pencil" onClick={(e) => { e.stopPropagation(); setEditingLabelId(section.id); openSectionEditor(section.id); }}>✏️</span>
              </h4>
              <p className="preview-text">{previewResume.skills.map((skill) => `${skill.skillName} (${skill.proficiency})`).join(" · ")}</p>
            </div>
          );
        }
        if (section.id === "interests") {
          return (
            <div
              key={section.id}
              className="preview-section-clickable"
              role="button"
              tabIndex={0}
              onClick={() => openSectionEditor(section.id)}
              onKeyDown={(e) => e.key === "Enter" && openSectionEditor(section.id)}
              title="Click to edit"
            >
              <h4>
                {section.label}
                <span className="preview-section-pencil" onClick={(e) => { e.stopPropagation(); setEditingLabelId(section.id); openSectionEditor(section.id); }}>✏️</span>
              </h4>
              <p className="preview-text">{previewResume.interests.join(" · ")}</p>
            </div>
          );
        }
        if (section.id === "languages") {
          return (
            <div
              key={section.id}
              className="preview-section-clickable"
              role="button"
              tabIndex={0}
              onClick={() => openSectionEditor(section.id)}
              onKeyDown={(e) => e.key === "Enter" && openSectionEditor(section.id)}
              title="Click to edit"
            >
              <h4>
                {section.label}
                <span className="preview-section-pencil" onClick={(e) => { e.stopPropagation(); setEditingLabelId(section.id); openSectionEditor(section.id); }}>✏️</span>
              </h4>
              <p className="preview-text">{previewResume.languages.map((language) => `${language.name} — ${language.level}`).join(" · ")}</p>
            </div>
          );
        }
        const customEntries = customSectionContents[section.id] || [];
        return (
          <div
            key={section.id}
            className="preview-section-clickable"
            role="button"
            tabIndex={0}
            onClick={() => openSectionEditor(section.id)}
            onKeyDown={(e) => e.key === "Enter" && openSectionEditor(section.id)}
            title="Click to edit"
          >
            <h4>
              {section.label}
              <span className="preview-section-pencil" onClick={(e) => { e.stopPropagation(); setEditingLabelId(section.id); openSectionEditor(section.id); }}>✏️</span>
            </h4>
            {customEntries.map((field) => {
              if (field.type === "title") {
                return <p key={field.id} className="preview-text" style={{ fontWeight: 700, marginBottom: "0.2rem" }}>{field.value || field.label}</p>;
              }
              if (field.type === "subTitle") {
                return <p key={field.id} className="preview-text" style={{ fontWeight: 600 }}>{field.value || field.label}</p>;
              }
              if (field.type === "dates") {
                return <p key={field.id} className="preview-text">{field.label}: {field.value || "Start"} — {field.secondaryValue || "End"}</p>;
              }
              if (field.type === "textList") {
                return (
                  <div key={field.id}>
                    {field.label && <p className="preview-text" style={{ fontWeight: 600 }}>{field.label}</p>}
                    {(field.items || []).filter(Boolean).map((item) => (
                      <p key={`${field.id}-${item}`} className="preview-bullet">• {item}</p>
                    ))}
                  </div>
                );
              }
              if (field.type === "scoreNumeric") {
                const numericScore = Math.min(5, Math.max(1, Number(field.value) || 1));
                return <p key={field.id} className="preview-text">{field.label}: {"★".repeat(numericScore)}{"☆".repeat(5 - numericScore)} ({numericScore}/5)</p>;
              }
              if (field.type === "scoreLevel") {
                return <p key={field.id} className="preview-text">{field.label}: {field.value || "Medium"}</p>;
              }
              return <p key={field.id} className="preview-text">{field.value}</p>;
            })}
          </div>
        );
      })
  );

  return (
    <div className={`shell ${chatOpen ? "chat-expanded" : "chat-collapsed"}`}>
      <header className="header">
        <h1>🌿 Job Hunter</h1>
        <div className="header-actions">
          {byokEnabled && (
            <ModelPickerDropdown
              provider={llmSettings.provider}
              open={modelPickerOpen}
              statusMap={modelStatusMap}
              onToggle={() => {
                const opening = !modelPickerOpen;
                setModelPickerOpen(opening);
                if (opening) pingAllProviders();
              }}
              onSelect={(p) => {
                switchProvider(p);
                setModelPickerOpen(false);
              }}
            />
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
          <SettingsMenu />
        </div>
      </header>
      <div className="app-layout">
        <div className="main-content">
          <div className="tabs-header">
            <button
              className={`icon-toggle-btn hamburger-toggle ${isJobSectionCollapsed ? "active" : ""}`}
              onClick={() => setIsJobSectionCollapsed((prev) => !prev)}
              title={isJobSectionCollapsed ? "Show job input" : "Hide job input"}
              aria-label={isJobSectionCollapsed ? "Show job input" : "Hide job input"}
            >
              ☰
            </button>
          </div>
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

          {tab === "resume" && (
            <>
              {showIntake && (
                <div className={`job-section ${isJobSectionCollapsed ? "collapsed" : ""}`}>
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
                </div>
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
                            className={`skill-chip ${insightTab === name ? "active" : ""}`}
                            onClick={() => setInsightTab(name)}
                            title={INSIGHT_TAB_LABELS[name]}
                          >
                            <span className="skill-chip__icon">
                              {INSIGHT_TAB_ICONS[name]}
                            </span>
                            <span className="skill-chip__label">
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
                      <span aria-hidden="true" />
                      <button
                        className="add-section-btn"
                        onClick={openAddSectionModal}
                        title="Add section"
                        aria-label="Add section"
                      >
                        +
                      </button>
                    </div>
                    {addSectionModalOpen && (
                      <div className="add-section-modal">
                        <div className="add-section-modal-header">
                          <h5>Add Section</h5>
                          <button onClick={() => setAddSectionModalOpen(false)}>✕</button>
                        </div>
                        <div className="add-section-mode-row">
                          <button className={sectionCreationMode === "template" ? "active" : ""} onClick={() => setSectionCreationMode("template")}>Default templates</button>
                          <button className={sectionCreationMode === "custom" ? "active" : ""} onClick={() => setSectionCreationMode("custom")}>Custom builder</button>
                        </div>
                        {sectionCreationMode === "template" ? (
                          <div className="add-section-template-grid">
                            {DEFAULT_SECTION_TEMPLATES.map((templateOption) => (
                              <label key={templateOption.id} className="template-option-row">
                                <input
                                  type="radio"
                                  checked={selectedTemplateId === templateOption.id}
                                  onChange={() => setSelectedTemplateId(templateOption.id)}
                                />
                                <span>{templateOption.label}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="structured-editor-list">
                            <input value={customSectionTitleDraft} onChange={(e) => setCustomSectionTitleDraft(e.target.value)} placeholder="Section title" />
                            <div className="custom-field-add-row">
                              {(Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[]).map((type) => (
                                <button key={type} className="small-action" onClick={() => addBlueprintField(type)}>
                                  + {CUSTOM_FIELD_TYPE_LABELS[type]}
                                </button>
                              ))}
                            </div>
                            {customFieldBlueprints.map((field, index, arr) => (
                              <div key={field.id} className="template-option-row custom-blueprint-row">
                                <span>{CUSTOM_FIELD_TYPE_LABELS[field.type]}</span>
                                <input value={field.label} onChange={(e) => updateBlueprintLabel(field.id, e.target.value)} />
                                <button onClick={() => moveBlueprintField(field.id, -1)} disabled={index === 0}>↑</button>
                                <button onClick={() => moveBlueprintField(field.id, 1)} disabled={index === arr.length - 1}>↓</button>
                                <button className="remove-entry-btn" onClick={() => removeBlueprintField(field.id)}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="add-section-modal-footer">
                          <button className="primary" onClick={createSectionFromAddModal}>Add section</button>
                        </div>
                      </div>
                    )}
                    {pendingDeleteSection && (
                      <div className="section-delete-modal-backdrop" role="presentation" onClick={cancelDeleteSection}>
                        <div
                          className="section-delete-modal"
                          role="alertdialog"
                          aria-modal="true"
                          aria-labelledby="delete-section-title"
                          aria-describedby="delete-section-description"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <h5 id="delete-section-title">Delete section?</h5>
                          <p id="delete-section-description">Are you sure you want to delete this section? This can’t be undone.</p>
                          <div className="section-delete-modal-actions">
                            <button className="destructive" onClick={confirmDeleteSection}>Delete</button>
                            <button ref={deleteCancelButtonRef} onClick={cancelDeleteSection}>Cancel</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="sr-only" aria-live="polite">{reorderLiveMessage}</p>
                    <DndContext
                      sensors={sectionDragSensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleSectionDragStart}
                      onDragEnd={handleSectionDragEnd}
                      onDragCancel={handleSectionDragCancel}
                    >
                      <SortableContext items={sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
                        <div className="section-manager-list">
                          {sections.map((section, index) => {
                            const listId = "sections";
                            const isGrabbed = grabState?.listId === listId && grabState.itemId === section.id;
                            return (
                              <SortableSectionRow
                                key={section.id}
                                section={section}
                                active={activeSectionId === section.id}
                                grabbed={isGrabbed}
                                editMode={editMode}
                                onKeyDown={(event) =>
                                  handleReorderKeyDown(event, {
                                    listId,
                                    itemId: section.id,
                                    index,
                                    total: sections.length,
                                    label: section.label || `Section ${index + 1}`,
                                    onMove: moveSections,
                                  })
                                }
                                onOpenEditor={() => openSectionEditor(section.id)}
                                onEditLabel={() => setEditingLabelId(section.id)}
                                onToggleVisibility={() => toggleSection(section.id)}
                                onRequestDelete={() => requestDeleteSection(section)}
                                onUpdateLabel={(label) => updateSectionLabel(section.id, label)}
                                editingLabel={editingLabelId === section.id}
                                setEditingLabel={(value) => {
                                  if (!value && editingLabelId === section.id) {
                                    setEditingLabelId(null);
                                  }
                                }}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                      <DragOverlay>
                        {activeSectionDragId ? (
                          <div className="section-manager-row drag-overlay">
                            <span className="section-drag-handle" aria-hidden="true">
                              {Array.from({ length: 6 }).map((_, dotIndex) => (
                                <span key={`overlay-dot-${dotIndex}`} className="section-drag-dot" />
                              ))}
                            </span>
                            <span className="section-row-label">
                              {sections.find((section) => section.id === activeSectionDragId)?.label || "Section"}
                            </span>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>

                  {editMode && activeSection && (
                    <section
                      className="focused-editor-card"
                      onBlurCapture={(event) => {
                        if (!editMode) return;
                        if (!(event.target instanceof HTMLElement)) return;
                        if (autosaveTimerRef.current) {
                          window.clearTimeout(autosaveTimerRef.current);
                        }
                        commitEditorChanges(activeSectionId);
                      }}
                    >
                      {editingLabelId === activeSectionId && (
                        <input
                          className="section-label-edit-input"
                          value={activeSection.label}
                          autoFocus
                          onChange={(e) => updateSectionLabel(activeSectionId, e.target.value)}
                          onBlur={() => setEditingLabelId(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingLabelId(null)}
                        />
                      )}

                      {/* Personal Details */}
                      {activeSectionId === "header" && (
                        <div className="structured-editor-list">
                          <input value={personalDetailFields.fullName} onChange={(e) => updatePersonalDetailField("fullName", e.target.value)} placeholder="Full name" />
                          <input value={personalDetailFields.professionalTitle} onChange={(e) => updatePersonalDetailField("professionalTitle", e.target.value)} placeholder="Professional title" />
                          <input value={personalDetailFields.email} onChange={(e) => updatePersonalDetailField("email", e.target.value)} placeholder="Email" />
                          <input value={personalDetailFields.phone} onChange={(e) => updatePersonalDetailField("phone", e.target.value)} placeholder="Phone" />
                          <input value={personalDetailFields.location} onChange={(e) => updatePersonalDetailField("location", e.target.value)} placeholder="Location" />
                          <input value={personalDetailFields.linkedIn} onChange={(e) => updatePersonalDetailField("linkedIn", e.target.value)} placeholder="LinkedIn" />
                          <input value={personalDetailFields.portfolio || ""} onChange={(e) => updatePersonalDetailField("portfolio", e.target.value)} placeholder="Portfolio (optional)" />
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
                                profile: (e.target as HTMLDivElement).innerText,
                              }))
                            }
                            dangerouslySetInnerHTML={{ __html: editorDraft.profile || "<p>Write your profile…</p>" }}
                          />
                        </>
                      )}

                      {/* Experience */}
                      {activeSectionId === "experience" && (
                        <div className="structured-editor-list">
                          <button
                            className="small-action add-entry-top-btn"
                            onClick={() =>
                              setEditorDraft((prev) => ({
                                ...prev,
                                experience: [
                                  ...prev.experience,
                                  { id: uuidv4(), jobTitle: "", employer: "", startDate: "", endDate: "", location: "", description: "", visible: true, order: prev.experience.length },
                                ],
                              }))
                            }
                          >
                            + Add experience
                          </button>
                          {editorDraft.experience.map((item, index) => (
                            <div className="structured-editor-row" key={item.id}>
                              <input value={item.jobTitle} placeholder="Job title" onChange={(e) => setEditorDraft((prev) => ({ ...prev, experience: prev.experience.map((si, i) => i === index ? { ...si, jobTitle: e.target.value } : si) }))} />
                              <input value={item.employer} placeholder="Employer" onChange={(e) => setEditorDraft((prev) => ({ ...prev, experience: prev.experience.map((si, i) => i === index ? { ...si, employer: e.target.value } : si) }))} />
                              <input value={item.startDate} placeholder="Start date" onChange={(e) => setEditorDraft((prev) => ({ ...prev, experience: prev.experience.map((si, i) => i === index ? { ...si, startDate: e.target.value } : si) }))} />
                              <input value={item.endDate} placeholder="End date" onChange={(e) => setEditorDraft((prev) => ({ ...prev, experience: prev.experience.map((si, i) => i === index ? { ...si, endDate: e.target.value } : si) }))} />
                              <input value={item.location} placeholder="Location" onChange={(e) => setEditorDraft((prev) => ({ ...prev, experience: prev.experience.map((si, i) => i === index ? { ...si, location: e.target.value } : si) }))} />
                              <textarea
                                className="manual-editor-box"
                                value={item.description}
                                rows={3}
                                placeholder="Impact description"
                                onChange={(e) =>
                                  setEditorDraft((prev) => ({
                                    ...prev,
                                    experience: prev.experience.map((si, i) =>
                                      i === index ? { ...si, description: e.target.value } : si,
                                    ),
                                  }))
                                }
                              />
                              <button
                                className="remove-field-btn"
                                onClick={() =>
                                  setEditorDraft((prev) => ({
                                    ...prev,
                                    experience: prev.experience.filter((_, i) => i !== index),
                                  }))
                                }
                                title="Remove"
                              >
                                −
                              </button>
                            </div>
                          ))}
                          {editorDraft.experience.length === 0 && (
                            <p className="editor-empty-state">No experience entries yet. Add your work history above.</p>
                          )}
                        </div>
                      )}

                      {/* Skills */}
                      {activeSectionId === "skills" && (
                        <div className="structured-editor-list">
                          <button className="small-action add-entry-top-btn" onClick={addSkillEntry}>
                            + Add skill
                          </button>
                          {editorDraft.skills.map((entry) => (
                            <div key={entry.id} className="entry-box skill-entry-box">
                              <div className="entry-box-header">
                                <span className="entry-box-type">Skill</span>
                                <button className="remove-entry-btn" onClick={() => removeSkillEntry(entry.id)} title="Remove">✕</button>
                              </div>
                              <input
                                value={entry.skillName}
                                placeholder="Skill name"
                                onChange={(e) => updateSkillEntry(entry.id, "skillName", e.target.value)}
                              />
                              <input
                                value={entry.proficiency}
                                placeholder="Level (e.g. Expert, Intermediate)"
                                onChange={(e) => updateSkillEntry(entry.id, "proficiency", e.target.value)}
                              />
                            </div>
                          ))}
                          {editorDraft.skills.length === 0 && (
                            <p className="editor-empty-state">No skills added yet.</p>
                          )}
                        </div>
                      )}

                      {/* Education */}
                      {activeSectionId === "education" && (
                        <div className="structured-editor-list">
                          {editorDraft.education.map((item, index) => {
                            const listId = "education-entries";
                            const itemId = item.id;
                            const isGrabbed = grabState?.listId === listId && grabState.itemId === itemId;
                            const isDropTarget = dropTarget?.listId === listId && dropTarget.itemId === itemId;
                            return (
                              <div className={`structured-editor-row reorderable-item ${isGrabbed ? "is-grabbed" : ""} ${isDropTarget ? "drag-over" : ""}`} key={itemId}
                                draggable
                                tabIndex={0}
                                aria-grabbed={isGrabbed}
                                aria-dropeffect={grabState?.listId === listId ? "move" : "none"}
                                onKeyDown={(event) => handleReorderKeyDown(event, {
                                  listId,
                                  itemId,
                                  index,
                                  total: editorDraft.education.length,
                                  label: `Education entry ${index + 1}`,
                                  onMove: (from, to) => moveDraftListEntries("education", from, to),
                                })}
                                onDragStart={() => setDragState({ listId, itemId })}
                                onDragOver={(e) => { e.preventDefault(); setDropTarget({ listId, itemId }); }}
                                onDragLeave={() => setDropTarget(null)}
                                onDrop={() => {
                                  if (dragState?.listId === listId) {
                                    const fromIndex = editorDraft.education.findIndex((value) => value.id === dragState.itemId);
                                    if (fromIndex >= 0 && fromIndex !== index) moveDraftListEntries("education", fromIndex, index);
                                  }
                                  setDragState(null);
                                  setDropTarget(null);
                                }}
                                onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                              >
                                <input
                                  value={item.degree}
                                  placeholder="e.g. BSc Computer Science, University Name"
                                  onChange={(e) => setEditorDraft((prev) => ({ ...prev, education: prev.education.map((entry, i) => i === index ? { ...entry, degree: e.target.value } : entry) }))}
                                />
                                <button
                                  className="remove-field-btn"
                                  onClick={() =>
                                    setEditorDraft((prev) => ({
                                      ...prev,
                                      education: prev.education.filter((_, i) => i !== index),
                                    }))
                                  }
                                  title="Remove"
                                >
                                  −
                                </button>
                              </div>
                            );
                          })}
                          <button
                            className="small-action"
                            onClick={() => appendListField("education")}
                          >
                            + Add item
                          </button>
                        </div>
                      )}

                      {/* Interests / Languages */}
                      {(activeSectionId === "interests" || activeSectionId === "languages") && (
                        <div className="structured-editor-list">
                          {(activeSectionId === "interests" ? editorDraft.interests : editorDraft.languages).map((item, index) => {
                            const key = activeSectionId === "interests" ? "interests" : "languages";
                            const listId = `${key}-entries`;
                            const itemId = `${key}-${index}`;
                            const isGrabbed = grabState?.listId === listId && grabState.itemId === itemId;
                            const isDropTarget = dropTarget?.listId === listId && dropTarget.itemId === itemId;
                            return (
                              <div className={`structured-editor-row reorderable-item ${key === "languages" ? "language-row" : ""} ${isGrabbed ? "is-grabbed" : ""} ${isDropTarget ? "drag-over" : ""}`} key={itemId}
                                draggable
                                tabIndex={0}
                                aria-grabbed={isGrabbed}
                                aria-dropeffect={grabState?.listId === listId ? "move" : "none"}
                                onKeyDown={(event) => handleReorderKeyDown(event, {
                                  listId,
                                  itemId,
                                  index,
                                  total: (editorDraft[key] as string[]).length,
                                  label: `${key} entry ${index + 1}`,
                                  onMove: (from, to) => moveDraftListEntries(key === "languages" ? "languages" : "interests", from, to),
                                })}
                                onDragStart={() => setDragState({ listId, itemId })}
                                onDragOver={(e) => { e.preventDefault(); setDropTarget({ listId, itemId }); }}
                                onDragLeave={() => setDropTarget(null)}
                                onDrop={() => {
                                  if (dragState?.listId === listId) {
                                    const fromIndex = (editorDraft[key] as Array<unknown>).findIndex((_, i) => `${key}-${i}` === dragState.itemId);
                                    if (fromIndex >= 0 && fromIndex !== index) moveDraftListEntries(key === "languages" ? "languages" : "interests", fromIndex, index);
                                  }
                                  setDragState(null);
                                  setDropTarget(null);
                                }}
                                onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                              >
                                <input
                                  value={typeof item === "string" ? item : item.name}
                                  data-language-name-id={typeof item === "string" ? undefined : item.id}
                                  placeholder={key === "languages" ? "Language (e.g., English)" : ""}
                                  onChange={(e) =>
                                    updateInterestOrLanguageField(
                                      activeSectionId === "interests" ? "interests" : "languages",
                                      index,
                                      e.target.value,
                                    )
                                  }
                                />
                                {key === "languages" && typeof item !== "string" && (
                                  <>
                                    <select
                                      value={item.level}
                                      onChange={(event) => updateLanguageLevel(index, event.target.value as LanguageLevel)}
                                    >
                                      {LANGUAGE_LEVEL_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.shortLabel}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="language-trash-btn"
                                      aria-label="Remove language"
                                      onClick={() => removeLanguage(index)}
                                      title="Remove language"
                                    >
                                      🗑
                                    </button>
                                  </>
                                )}
                                {key === "interests" && (
                                  <button
                                    className="remove-field-btn"
                                    onClick={() => {
                                      setEditorDraft((prev) => ({
                                        ...prev,
                                        interests: prev.interests.filter((_, i) => i !== index),
                                      }));
                                    }}
                                    title="Remove"
                                  >
                                    −
                                  </button>
                                )}
                              </div>
                            );
                          })}
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
                          <div className="custom-field-add-row">
                            {(Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[]).map((type) => (
                              <button key={type} className="small-action" onClick={() => addCustomSectionField(activeSectionId, type)}>
                                + {CUSTOM_FIELD_TYPE_LABELS[type]}
                              </button>
                            ))}
                          </div>
                          <button className="small-action add-entry-top-btn" onClick={() => addCustomSectionField(activeSectionId, "title")}>
                            + Add entry
                          </button>
                          {(customSectionContents[activeSectionId] || []).map((field, index) => {
                            const listId = `${activeSectionId}-custom-entries`;
                            const isGrabbed = grabState?.listId === listId && grabState.itemId === field.id;
                            const isDropTarget = dropTarget?.listId === listId && dropTarget.itemId === field.id;
                            return (
                            <div key={field.id} className={`entry-box reorderable-item ${isGrabbed ? "is-grabbed" : ""} ${isDropTarget ? "drag-over" : ""}`}
                              draggable
                              tabIndex={0}
                              aria-grabbed={isGrabbed}
                              aria-dropeffect={grabState?.listId === listId ? "move" : "none"}
                              onKeyDown={(event) => handleReorderKeyDown(event, {
                                listId,
                                itemId: field.id,
                                index,
                                total: (customSectionContents[activeSectionId] || []).length,
                                label: field.label || `Custom entry ${index + 1}`,
                                onMove: (from, to) => moveCustomSectionEntry(activeSectionId, from, to),
                              })}
                              onDragStart={() => setDragState({ listId, itemId: field.id })}
                              onDragOver={(e) => { e.preventDefault(); setDropTarget({ listId, itemId: field.id }); }}
                              onDragLeave={() => setDropTarget(null)}
                              onDrop={() => {
                                if (dragState?.listId === listId && dragState.itemId !== field.id) {
                                  setCustomSectionContents((prev) => ({
                                    ...prev,
                                    [activeSectionId]: moveArrayItemById(prev[activeSectionId] || [], dragState.itemId, field.id),
                                  }));
                                }
                                setDragState(null);
                                setDropTarget(null);
                              }}
                              onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                            >
                              <div className="entry-box-header">
                                <span className="entry-box-type">Entry</span>
                                <button className="remove-entry-btn" onClick={() => removeCustomSectionField(activeSectionId, field.id)} title="Remove">✕</button>
                              </div>
                              <input
                                value={field.label}
                                placeholder="Field label"
                                onChange={(e) => updateCustomSectionField(activeSectionId, field.id, { label: e.target.value })}
                              />
                              {field.type === "dates" && (
                                <div className="date-fields-row">
                                  <input value={field.value} placeholder="Start date" onChange={(e) => updateCustomSectionField(activeSectionId, field.id, { value: e.target.value })} />
                                  <input value={field.secondaryValue || ""} placeholder="End date" onChange={(e) => updateCustomSectionField(activeSectionId, field.id, { secondaryValue: e.target.value })} />
                                </div>
                              )}
                              {field.type === "scoreNumeric" && (
                                <input type="number" min={1} max={5} value={field.value} onChange={(e) => updateCustomSectionField(activeSectionId, field.id, { value: e.target.value })} />
                              )}
                              {field.type === "scoreLevel" && (
                                <select value={field.value} onChange={(e) => updateCustomSectionField(activeSectionId, field.id, { value: e.target.value })}>
                                  <option>Low</option>
                                  <option>Medium</option>
                                  <option>High</option>
                                </select>
                              )}
                              {field.type === "textList" && (
                                <div className="structured-editor-list">
                                  {(field.items || [""]).map((item, itemIndex) => (
                                    <div key={`${field.id}-${itemIndex}`} className="structured-editor-row text-list-row">
                                      <input value={item} placeholder={`List item ${itemIndex + 1}`} onChange={(e) => updateCustomSectionListItem(activeSectionId, field.id, itemIndex, e.target.value)} />
                                      <button className="remove-field-btn" onClick={() => removeCustomSectionListItem(activeSectionId, field.id, itemIndex)} title="Remove">−</button>
                                    </div>
                                  ))}
                                  <button className="small-action" onClick={() => addCustomSectionListItem(activeSectionId, field.id)}>+ Add list item</button>
                                </div>
                              )}
                              {field.type !== "dates" && field.type !== "scoreNumeric" && field.type !== "scoreLevel" && field.type !== "textList" && (
                                <textarea
                                  className="manual-editor-box"
                                  value={field.value}
                                  placeholder="Value"
                                  rows={field.type === "textParagraph" ? 4 : 2}
                                  onChange={(e) => updateCustomSectionField(activeSectionId, field.id, { value: e.target.value })}
                                />
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}

                      <footer className="focused-editor-footer">
                        {savedSectionId === activeSectionId && (
                          <span className="section-save-confirmation footer-confirmation" role="status" aria-live="polite">
                            ✓ Saved
                          </span>
                        )}
                        <button className="primary" onClick={saveEditingResume}>Done</button>
                      </footer>
                    </section>
                  )}
                  </aside>

                <main className={`resume-preview ${template.toLowerCase()}`}>
                  <div className="preview-toolbar">
                    <button
                      className="round-icon-button toolbar-preview-modal"
                      onClick={() => setIsPreviewOpen(true)}
                      aria-label="Open preview modal"
                    >
                      👁
                    </button>
                  </div>

                  <div className="preview-frame">
                    <div className="preview-content">{renderResumePreviewContent()}</div>
                  </div>
                </main>
                <PreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)}>
                  <div className={`resume-preview ${template.toLowerCase()} preview-modal-resume`}>
                    <div className="preview-frame">
                      <div className="preview-content">{renderResumePreviewContent()}</div>
                    </div>
                  </div>
                </PreviewModal>
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
                      onChange={(e) => switchProvider(e.target.value as LlmProvider)}
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
                    <select
                      value={llmSettings.model}
                      onChange={(e) =>
                        setLlmSettings((prev) => ({
                          ...prev,
                          model: e.target.value,
                        }))
                      }
                    >
                      {getModelsForProvider(llmSettings.provider).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
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
