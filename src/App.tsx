import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import "./App.css";

type TemplateName = "Modern" | "Classic" | "Technical" | "Professional";
type LanguageLevel = "Native" | "Fluent" | "Professional" | "Conversational" | "Basic";

type SectionId = "header" | "profile" | "experience" | "education" | "skills" | "interests" | "languages";

type ResumeSection = { id: SectionId; label: string; visible: boolean };
type ExperienceItem = { id: string; role: string; company: string; summary: string };
type EducationItem = { id: string; institution: string; degree: string };
type SkillItem = { id: string; name: string };
type InterestItem = { id: string; value: string };
type LanguageItem = { id: string; language: string; level: LanguageLevel };

type ResumeData = {
  name: string;
  title: string;
  email: string;
  profile: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  interests: InterestItem[];
  languages: LanguageItem[];
};

type DragMeta = { list: string; id: string } | null;

const templates: TemplateName[] = ["Modern", "Classic", "Technical", "Professional"];
const languageLevels: LanguageLevel[] = ["Native", "Fluent", "Professional", "Conversational", "Basic"];

const initialSections: ResumeSection[] = [
  { id: "header", label: "Header", visible: true },
  { id: "profile", label: "Profile", visible: true },
  { id: "experience", label: "Experience", visible: true },
  { id: "education", label: "Education", visible: true },
  { id: "skills", label: "Skills", visible: true },
  { id: "interests", label: "Interests", visible: true },
  { id: "languages", label: "Languages", visible: true },
];

const makeId = () => crypto.randomUUID();

function moveById<T extends { id: string }>(list: T[], sourceId: string, targetId: string) {
  const from = list.findIndex((item) => item.id === sourceId);
  const to = list.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function App() {
  const [template, setTemplate] = useState<TemplateName>("Modern");
  const [sections, setSections] = useState(initialSections);
  const [activeSectionId, setActiveSectionId] = useState<SectionId>("header");
  const [resume, setResume] = useState<ResumeData>({
    name: "",
    title: "",
    email: "",
    profile: "",
    experience: [{ id: makeId(), role: "", company: "", summary: "" }],
    education: [{ id: makeId(), institution: "", degree: "" }],
    skills: [{ id: makeId(), name: "" }],
    interests: [{ id: makeId(), value: "" }],
    languages: [{ id: makeId(), language: "English", level: "Fluent" }],
  });

  const [dragState, setDragState] = useState<DragMeta>(null);
  const [dropTarget, setDropTarget] = useState<DragMeta>(null);
  const [listMode, setListMode] = useState<"none" | "ul" | "ol">("none");
  const profileEditorRef = useRef<HTMLDivElement | null>(null);

  const visibleSections = useMemo(() => sections.filter((s) => s.visible), [sections]);

  const handleDrop = (target: DragMeta, onReorder: (sourceId: string, targetId: string) => void) => {
    if (!dragState || dragState.list !== target?.list || dragState.id === target.id) return;
    onReorder(dragState.id, target.id);
    setDragState(null);
    setDropTarget(null);
  };

  const editorHeader = sections.find((section) => section.id === activeSectionId)?.label ?? "Section";

  const renderHandle = (list: string, id: string, label: string) => (
    <button
      type="button"
      className="drag-handle"
      draggable
      aria-label={`Drag ${label}`}
      onDragStart={() => setDragState({ list, id })}
      onDragEnd={() => {
        setDragState(null);
        setDropTarget(null);
      }}
    >
      ⠿
    </button>
  );

  const onProfileEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    if (listMode === "none") {
      event.preventDefault();
      document.execCommand("insertParagraph", false);
    }
  };

  return (
    <div className="app-shell">
      <section className="left-panel">
        <div className="left-top-row">
          <label>
            Template
            <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateName)}>
              {templates.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>

        <div className="section-list">
          {sections.map((section) => {
            const isDrop = dropTarget?.list === "sections" && dropTarget.id === section.id;
            return (
              <div
                key={section.id}
                className={`tile ${activeSectionId === section.id ? "active" : ""} ${isDrop ? "drop-target" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget({ list: "sections", id: section.id });
                }}
                onDrop={() => handleDrop({ list: "sections", id: section.id }, (sourceId, targetId) => {
                  setSections((prev) => moveById(prev, sourceId, targetId));
                })}
              >
                {renderHandle("sections", section.id, "section")}
                <button type="button" className="section-button" onClick={() => setActiveSectionId(section.id)}>{section.label}</button>
              </div>
            );
          })}
        </div>

        <div className="editor-card">
          <header className="editor-header">
            <div>
              <p className="kicker">Editing section</p>
              <h3>{editorHeader}</h3>
            </div>
            <button type="button" onClick={() => setSections((prev) => prev.map((s) => s.id === activeSectionId ? { ...s, visible: !s.visible } : s))}>Hide</button>
          </header>

          <div className="editor-body">
            {activeSectionId === "header" && (
              <>
                <input value={resume.name} onChange={(e) => setResume((p) => ({ ...p, name: e.target.value }))} placeholder="Name" />
                <input value={resume.title} onChange={(e) => setResume((p) => ({ ...p, title: e.target.value }))} placeholder="Title" />
                <input value={resume.email} onChange={(e) => setResume((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
              </>
            )}

            {activeSectionId === "profile" && (
              <>
                <div className="toolbar">
                  <button type="button" onClick={() => { setListMode("ul"); document.execCommand("insertUnorderedList"); }}>• List</button>
                  <button type="button" onClick={() => { setListMode("ol"); document.execCommand("insertOrderedList"); }}>1. List</button>
                  <button type="button" onClick={() => setListMode("none")}>Paragraph</button>
                </div>
                <div
                  ref={profileEditorRef}
                  className="profile-editor"
                  contentEditable
                  suppressContentEditableWarning
                  onKeyDown={onProfileEnter}
                  onInput={(e) => setResume((p) => ({ ...p, profile: (e.currentTarget as HTMLDivElement).innerHTML }))}
                  dangerouslySetInnerHTML={{ __html: resume.profile || "<p></p>" }}
                />
              </>
            )}

            {activeSectionId === "experience" && (
              <div className="stack">
                {resume.experience.map((item) => {
                  const isDrop = dropTarget?.list === "experience" && dropTarget.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`tile column ${isDrop ? "drop-target" : ""}`}
                      onDragOver={(e) => { e.preventDefault(); setDropTarget({ list: "experience", id: item.id }); }}
                      onDrop={() => handleDrop({ list: "experience", id: item.id }, (sourceId, targetId) => setResume((p) => ({ ...p, experience: moveById(p.experience, sourceId, targetId) })))}
                    >
                      <div className="tile-row">{renderHandle("experience", item.id, "entry")}<button type="button" className="trash" aria-label="Delete entry" onClick={() => setResume((p) => ({ ...p, experience: p.experience.filter((x) => x.id !== item.id) }))}>🗑</button></div>
                      <input value={item.role} onChange={(e) => setResume((p) => ({ ...p, experience: p.experience.map((x) => x.id === item.id ? { ...x, role: e.target.value } : x) }))} placeholder="Role" />
                      <input value={item.company} onChange={(e) => setResume((p) => ({ ...p, experience: p.experience.map((x) => x.id === item.id ? { ...x, company: e.target.value } : x) }))} placeholder="Company" />
                      <textarea value={item.summary} onChange={(e) => setResume((p) => ({ ...p, experience: p.experience.map((x) => x.id === item.id ? { ...x, summary: e.target.value } : x) }))} placeholder="Summary" rows={3} />
                    </div>
                  );
                })}
                <button type="button" onClick={() => setResume((p) => ({ ...p, experience: [...p.experience, { id: makeId(), role: "", company: "", summary: "" }] }))}>+ Add entry</button>
              </div>
            )}

            {activeSectionId === "languages" && (
              <div className="stack">
                {resume.languages.map((item) => {
                  const isDrop = dropTarget?.list === "languages" && dropTarget.id === item.id;
                  return (
                    <div key={item.id} className={`tile row ${isDrop ? "drop-target" : ""}`} onDragOver={(e) => { e.preventDefault(); setDropTarget({ list: "languages", id: item.id }); }} onDrop={() => handleDrop({ list: "languages", id: item.id }, (sourceId, targetId) => setResume((p) => ({ ...p, languages: moveById(p.languages, sourceId, targetId) })))}>
                      {renderHandle("languages", item.id, "language")}
                      <input value={item.language} onChange={(e) => setResume((p) => ({ ...p, languages: p.languages.map((x) => x.id === item.id ? { ...x, language: e.target.value } : x) }))} placeholder="Language" />
                      <select value={item.level} onChange={(e) => setResume((p) => ({ ...p, languages: p.languages.map((x) => x.id === item.id ? { ...x, level: e.target.value as LanguageLevel } : x) }))}>
                        {languageLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>
                      <button type="button" className="trash" aria-label="Delete language" onClick={() => setResume((p) => ({ ...p, languages: p.languages.filter((x) => x.id !== item.id) }))}>🗑</button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setResume((p) => ({ ...p, languages: [...p.languages, { id: makeId(), language: "", level: "Conversational" }] }))}>+ Add language</button>
              </div>
            )}

            {activeSectionId === "interests" && (
              <div className="stack">
                {resume.interests.map((item) => {
                  const isDrop = dropTarget?.list === "interests" && dropTarget.id === item.id;
                  return (
                    <div key={item.id} className={`tile row ${isDrop ? "drop-target" : ""}`} onDragOver={(e) => { e.preventDefault(); setDropTarget({ list: "interests", id: item.id }); }} onDrop={() => handleDrop({ list: "interests", id: item.id }, (sourceId, targetId) => setResume((p) => ({ ...p, interests: moveById(p.interests, sourceId, targetId) })))}>
                      {renderHandle("interests", item.id, "interest")}
                      <input value={item.value} onChange={(e) => setResume((p) => ({ ...p, interests: p.interests.map((x) => x.id === item.id ? { ...x, value: e.target.value } : x) }))} />
                      <button type="button" className="trash" aria-label="Delete entry" onClick={() => setResume((p) => ({ ...p, interests: p.interests.filter((x) => x.id !== item.id) }))}>🗑</button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setResume((p) => ({ ...p, interests: [...p.interests, { id: makeId(), value: "" }] }))}>+ Add interest</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`middle-panel ${template.toLowerCase()}`}>
        <div className="paper-wrap">
          <article className="paper">
            {visibleSections.map((section) => {
              if (section.id === "header") return <header key={section.id}><h1>{resume.name || "Your Name"}</h1><p>{resume.title}</p><p>{resume.email}</p></header>;
              if (section.id === "profile") return <section key={section.id}><h4>{section.label}</h4><div dangerouslySetInnerHTML={{ __html: resume.profile || "<p>Profile</p>" }} /></section>;
              if (section.id === "experience") return <section key={section.id}><h4>{section.label}</h4>{resume.experience.map((x) => <p key={x.id}><strong>{x.role}</strong> {x.company} — {x.summary}</p>)}</section>;
              if (section.id === "education") return <section key={section.id}><h4>{section.label}</h4>{resume.education.map((x) => <p key={x.id}>{x.degree} {x.institution}</p>)}</section>;
              if (section.id === "skills") return <section key={section.id}><h4>{section.label}</h4>{resume.skills.map((x) => <p key={x.id}>{x.name}</p>)}</section>;
              if (section.id === "interests") return <section key={section.id}><h4>{section.label}</h4><p>{resume.interests.map((x) => x.value).filter(Boolean).join(" · ")}</p></section>;
              if (section.id === "languages") return <section key={section.id}><h4>{section.label}</h4>{resume.languages.map((x) => <p key={x.id}>{x.language || "Language"} — {x.level}</p>)}</section>;
              return null;
            })}
          </article>
        </div>
      </section>

      <section className="right-panel">Controls</section>
    </div>
  );
}

export default App;
