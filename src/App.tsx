import { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import { v4 as uuidv4 } from 'uuid'
import { AGENT_PROMPTS, type AgentPromptId } from './agentPrompts'
import './App.css'

type TemplateName = 'Modern' | 'Classic' | 'Technical'
type TabName = 'resume' | 'coverLetter' | 'history'
type SectionId = 'header' | 'summary' | 'skills' | 'experience' | 'insights' | 'checklist'
type InsightTab = 'soft' | 'hard' | 'reviews' | 'salary' | 'values'

type ExperienceItem = { id: string; text: string; company: string; skillTags: string[]; selected: boolean }
type ResumeData = {
  fullName: string
  email: string
  phone: string
  location: string
  targetRole: string
  summary: string
  keySkills: string[]
  selectedExperience: ExperienceItem[]
  organization: string
}
type ResumeSection = { id: SectionId; label: string; visible: boolean }
type SubmissionHistory = { id: string; date: string; role: string; company: string; template: TemplateName; resume: ResumeData; coverLetter: string }
type RequirementCheck = { id: string; requirement: string; score: number; reason: string }
type AgentOutputs = {
  job: Record<string, unknown>
  company: Record<string, unknown>
  candidate: Record<string, unknown>
  draft: Record<string, unknown>
  gap: Record<string, unknown>
}

const SKILL_KEYWORDS = ['react', 'typescript', 'javascript', 'python', 'java', 'aws', 'docker', 'kubernetes', 'sql', 'data', 'product', 'api', 'node', 'leadership', 'agile', 'communication', 'design', 'testing', 'ci/cd']
const TEMPLATES: TemplateName[] = ['Modern', 'Classic', 'Technical']

const initialResume: ResumeData = { fullName: '', email: '', phone: '', location: '', targetRole: '', summary: '', keySkills: [], selectedExperience: [], organization: '' }
const initialSections: ResumeSection[] = [
  { id: 'header', label: 'Header', visible: true },
  { id: 'summary', label: 'Professional Summary', visible: true },
  { id: 'skills', label: 'Skills', visible: true },
  { id: 'experience', label: 'Experience', visible: true },
  { id: 'insights', label: 'Application key points', visible: true },
  { id: 'checklist', label: 'Requirement checklist', visible: true },
]

function scoreClass(score: number) {
  if (score >= 75) return 'score-good'
  if (score >= 45) return 'score-warn'
  return 'score-bad'
}

function App() {
  const [tab, setTab] = useState<TabName>('resume')
  const [jobText, setJobText] = useState('')
  const [jobLink, setJobLink] = useState('')
  const [experienceDoc, setExperienceDoc] = useState('')
  const [experienceItems, setExperienceItems] = useState<ExperienceItem[]>([])
  const [resume, setResume] = useState<ResumeData>(initialResume)
  const [coverLetter, setCoverLetter] = useState('')
  const [coverLetterNotes, setCoverLetterNotes] = useState('')
  const [template, setTemplate] = useState<TemplateName>('Modern')
  const [history, setHistory] = useState<SubmissionHistory[]>(() => JSON.parse(localStorage.getItem('job-hunt-history') || '[]'))
  const [companyFilter, setCompanyFilter] = useState('all')
  const [skillFilter, setSkillFilter] = useState('all')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<string[]>(['Hi! I can help complete missing CV details.'])
  const [zoom, setZoom] = useState(1)
  const [editMode, setEditMode] = useState(false)
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false)
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false)
  const [sections, setSections] = useState<ResumeSection[]>(initialSections)
  const [requirementChecks, setRequirementChecks] = useState<RequirementCheck[]>([])
  const [analyzingRequirements, setAnalyzingRequirements] = useState(false)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const [insightTab, setInsightTab] = useState<InsightTab>('soft')
  const [insightData, setInsightData] = useState<Record<InsightTab, string[]>>({ soft: [], hard: [], reviews: [], salary: [], values: [] })
  const [agentOutputs, setAgentOutputs] = useState<AgentOutputs | null>(null)
  const previewRef = useRef<HTMLElement | null>(null)

  useEffect(() => localStorage.setItem('job-hunt-history', JSON.stringify(history)), [history])
  useEffect(() => {
    const onFullscreenChange = () => setPreviewFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === previewRef.current))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const companies = useMemo(() => ['all', ...Array.from(new Set(experienceItems.map((item) => item.company)))], [experienceItems])
  const skills = useMemo(() => ['all', ...Array.from(new Set(experienceItems.flatMap((item) => item.skillTags)))], [experienceItems])
  const filteredExperience = useMemo(() => experienceItems.filter((item) => (companyFilter === 'all' || item.company === companyFilter) && (skillFilter === 'all' || item.skillTags.includes(skillFilter))), [experienceItems, companyFilter, skillFilter])
  const sectionMap = useMemo(() => Object.fromEntries(sections.map((section) => [section.id, section])) as Record<SectionId, ResumeSection>, [sections])

  async function callModel(agent: AgentPromptId, payload: Record<string, unknown>) {
    const apiUrl = import.meta.env.VITE_LLM_API_URL
    const model = import.meta.env.VITE_LLM_MODEL || 'gpt-4o-mini'
    const key = import.meta.env.VITE_LLM_API_KEY
    if (!apiUrl) return null

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: AGENT_PROMPTS[agent] },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        temperature: 0.2,
      }),
    })

    if (!res.ok) throw new Error(`Agent ${agent} failed`)
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || '{}'
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  function parseExperience(raw: string) {
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
    const chosen = lines.filter((line) => line.startsWith('-') || line.startsWith('*') || /^[0-9]+\./.test(line)).map((line) => line.replace(/^[-*\d.\s]+/, ''))
    const parsed: ExperienceItem[] = (chosen.length ? chosen : lines.slice(0, 12)).map((line) => {
      const company = line.match(/at\s+([A-Z][A-Za-z0-9&\s-]+)/)?.[1]?.trim() || 'General'
      const skillTags = SKILL_KEYWORDS.filter((skill) => line.toLowerCase().includes(skill))
      return { id: uuidv4(), text: line, company, skillTags: skillTags.length ? skillTags : ['general'], selected: true }
    })
    setExperienceItems(parsed)
    return parsed
  }

  function extractPersonInfo(text: string) {
    return {
      email: text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '',
      phone: text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0] || '',
      fullName: (text.split('\n').find((line) => line.trim().length > 3) || '').replace(/[^a-zA-Z\s'-]/g, '').trim(),
    }
  }

  async function fetchFromUrl() {
    if (!jobLink.trim()) return
    try {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(jobLink.trim())}`)
      const importedText = (await res.text()).slice(0, 7000)
      setJobText((prev) => [prev, importedText].filter(Boolean).join('\n\n'))
    } catch {
      setChatOpen(true)
      setChatMessages((prev) => [...prev, 'Could not import URL directly. Please paste the job description text.'])
    }
  }

  async function runAgent1JobAnalyzer(jobDescription: string) {
    const llm = await callModel('jobAnalyzer', { jobDescription })
    if (llm) return llm
    const hard = SKILL_KEYWORDS.filter((skill) => jobDescription.toLowerCase().includes(skill))
    return { hardSkills: hard, softSkills: ['communication', 'collaboration'], mustHaves: hard.slice(0, 6), requirementsChecklist: hard.map((s) => `Experience with ${s}`), snapshot: { title: 'Target Role' } }
  }

  async function runAgent2Scraper(jobDescription: string) {
    const llm = await callModel('scraper', { jobDescription, company: resume.organization })
    if (llm) return llm
    return {
      companyValues: ['Ownership', 'Customer focus', 'Bias for action'],
      employeeReviews: ['Fast-paced team with strong autonomy', 'Lean processes and high accountability'],
      salaryExpectations: ['Market range depends on location and seniority.'],
      keywordInjection: ['ownership', 'impact', 'cross-functional', 'scale', 'execution'],
    }
  }

  async function runAgent3Parser(documentText: string) {
    const llm = await callModel('experienceParser', { documentText })
    if (llm) return llm
    return { parsedBullets: parseExperience(documentText).map((x) => x.text), technicalSkills: SKILL_KEYWORDS.filter((skill) => documentText.toLowerCase().includes(skill)) }
  }

  async function runAgent4Matcher(job: Record<string, unknown>, company: Record<string, unknown>, candidate: Record<string, unknown>) {
    const llm = await callModel('matcher', { job, company, candidate })
    if (llm) return llm
    return {
      summary: `Results-driven candidate aligned to ${(job.snapshot as { title?: string } | undefined)?.title || 'target role'}.`,
      selectedSkills: ((job.mustHaves as string[] | undefined) || []).slice(0, 10),
      tailoredExperience: ((candidate.parsedBullets as string[] | undefined) || []).slice(0, 8),
    }
  }

  async function runAgent5Checker(job: Record<string, unknown>, draft: Record<string, unknown>, candidate: Record<string, unknown>) {
    const llm = await callModel('gapAnalyst', { job, draft, candidate })
    if (llm) return llm
    const reqs = (job.requirementsChecklist as string[] | undefined) || []
    return {
      interviewQuestions: ['Can you quantify your most relevant project impact?', 'Which missing tools have you used in adjacent contexts?'],
      requirementScores: reqs.map((r) => ({ requirement: r, score: Math.max(20, Math.round(Math.random() * 90)), reason: 'Heuristic score.' })),
      criticalGaps: ['Add concrete metrics for ownership and leadership examples.'],
    }
  }

  async function runAgent6Refiner(userAnswer: string, gap: Record<string, unknown>, draft: Record<string, unknown>) {
    const llm = await callModel('refiner', { userAnswer, gap, draft })
    if (llm) return llm
    return { patchInstructions: ['Add quantified impact to recent role bullets.', 'Add missing tool usage in skills matrix.'] }
  }

  async function generateResume() {
    setAnalyzingRequirements(true)
    try {
      const parsed = parseExperience(experienceDoc)
      const info = extractPersonInfo(experienceDoc)
      const organization = jobText.match(/at\s+([A-Z][A-Za-z0-9&\s-]{2,})/i)?.[1]?.trim() || 'Target Company'
      const [job, company, candidate] = await Promise.all([runAgent1JobAnalyzer(jobText), runAgent2Scraper(jobText), runAgent3Parser(experienceDoc)])
      const draft = await runAgent4Matcher(job, company, candidate)
      const gap = await runAgent5Checker(job, draft, candidate)
      setAgentOutputs({ job, company, candidate, draft, gap })

      setResume({
        fullName: info.fullName || 'Your Name',
        email: info.email,
        phone: info.phone,
        location: 'Location',
        targetRole: String((draft.targetRole as string | undefined) || (job.snapshot as { title?: string } | undefined)?.title || 'Target Role'),
        summary: String((draft.summary as string | undefined) || 'Tailored summary generated by matcher agent.'),
        keySkills: ((draft.selectedSkills as string[] | undefined) || (job.mustHaves as string[] | undefined) || []).slice(0, 12),
        selectedExperience: parsed.map((item, i) => ({ ...item, text: ((draft.tailoredExperience as string[] | undefined) || [])[i] || item.text })),
        organization,
      })

      setRequirementChecks((((gap.requirementScores as { requirement: string; score: number; reason: string }[] | undefined) || []).slice(0, 20)).map((x) => ({ id: uuidv4(), ...x })))
      setInsightData({
        soft: ((job.softSkills as string[] | undefined) || []).slice(0, 8),
        hard: ((job.hardSkills as string[] | undefined) || []).slice(0, 10),
        reviews: ((company.employeeReviews as string[] | undefined) || []).slice(0, 6),
        salary: ((company.salaryExpectations as string[] | undefined) || []).slice(0, 4),
        values: ((company.companyValues as string[] | undefined) || []).slice(0, 6),
      })

      setChatOpen(true)
      setChatMessages((prev) => [...prev, 'Agent 5 found potential gaps. Please answer the follow-up questions below.', ...(((gap.interviewQuestions as string[] | undefined) || []).map((q) => `• ${q}`))])
    } finally {
      setAnalyzingRequirements(false)
    }
  }

  async function runCheckerOnly() {
    if (!agentOutputs) return
    setAnalyzingRequirements(true)
    try {
      const gap = await runAgent5Checker(agentOutputs.job, agentOutputs.draft, agentOutputs.candidate)
      setRequirementChecks((((gap.requirementScores as { requirement: string; score: number; reason: string }[] | undefined) || []).slice(0, 20)).map((x) => ({ id: uuidv4(), ...x })))
    } finally {
      setAnalyzingRequirements(false)
    }
  }

  async function submitGapAnswer() {
    if (!chatInput.trim() || !agentOutputs) return
    const answer = chatInput.trim()
    setChatInput('')
    setChatMessages((prev) => [...prev, `You: ${answer}`])
    const patch = await runAgent6Refiner(answer, agentOutputs.gap, agentOutputs.draft)
    const patchedDraft = await runAgent4Matcher(agentOutputs.job, agentOutputs.company, { ...agentOutputs.candidate, patch })
    setResume((prev) => ({
      ...prev,
      summary: String((patchedDraft.summary as string | undefined) || prev.summary),
      keySkills: ((patchedDraft.selectedSkills as string[] | undefined) || prev.keySkills).slice(0, 12),
    }))
    setChatMessages((prev) => [...prev, 'Agent 6 integrated your context and sent an update back to Agent 4. CV has been refreshed.'])
  }

  function applySelectedExperience() { setResume((prev) => ({ ...prev, selectedExperience: experienceItems.filter((item) => item.selected) })) }
  function toggleExperience(id: string) { setExperienceItems((prev) => prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))) }
  function toggleSection(id: SectionId) { setSections((prev) => prev.map((section) => (section.id === id ? { ...section, visible: !section.visible } : section))) }
  function updateSectionLabel(id: SectionId, label: string) { setSections((prev) => prev.map((section) => (section.id === id ? { ...section, label } : section))) }
  function moveBullet(index: number, direction: 'up' | 'down') { setResume((prev) => { const next = [...prev.selectedExperience]; const t = direction === 'up' ? index - 1 : index + 1; if (t < 0 || t >= next.length) return prev; [next[index], next[t]] = [next[t], next[index]]; return { ...prev, selectedExperience: next } }) }
  async function togglePreviewFullscreen() { if (!previewRef.current) return; if (!document.fullscreenElement) return previewRef.current.requestFullscreen(); if (document.fullscreenElement === previewRef.current) return document.exitFullscreen() }

  function generateCoverLetter() {
    setCoverLetter(`Dear Hiring Team at ${resume.organization || 'the company'},\n\nI am excited to apply for the ${resume.targetRole || 'open role'}. I bring strengths in ${resume.keySkills.slice(0, 5).join(', ')} and have delivered:\n${resume.selectedExperience.slice(0, 3).map((item) => `• ${item.text}`).join('\n')}\n\n${coverLetterNotes ? `${coverLetterNotes}\n\n` : ''}Sincerely,\n${resume.fullName || 'Candidate'}`)
  }

  function downloadResumePdf() {
    const doc = new jsPDF(); let y = 20
    doc.setFontSize(18); doc.text(resume.fullName || 'Your Name', 14, y); y += 8
    doc.setFontSize(11); doc.text(`${resume.email} | ${resume.phone} | ${resume.location}`, 14, y); y += 8
    doc.text(`Target Role: ${resume.targetRole}`, 14, y); y += 8
    doc.text(resume.summary, 14, y, { maxWidth: 180 }); y += 16
    doc.text(`Skills: ${resume.keySkills.join(', ')}`, 14, y, { maxWidth: 180 }); y += 12
    resume.selectedExperience.forEach((item) => { doc.text(`• ${item.text}`, 14, y, { maxWidth: 180 }); y += 7; if (y > 275) { doc.addPage(); y = 20 } })
    doc.save(`${(resume.fullName || 'resume').replace(/\s+/g, '_')}.pdf`)
  }

  function onUpload(file: File) { const reader = new FileReader(); reader.onload = () => setExperienceDoc(String(reader.result || '')); reader.readAsText(file) }
  function saveToHistory() { setHistory((prev) => [{ id: uuidv4(), date: new Date().toISOString(), role: resume.targetRole, company: resume.organization, template, resume, coverLetter }, ...prev].slice(0, 30)) }

  return (
    <div className="shell">
      <header className="header"><h1>Job Hunt Co-Pilot</h1><div><button onClick={downloadResumePdf}>Download PDF</button></div></header>
      <nav className="tabs"><button className={tab === 'resume' ? 'active' : ''} onClick={() => setTab('resume')}>Resume Builder</button><button className={tab === 'coverLetter' ? 'active' : ''} onClick={() => setTab('coverLetter')}>Cover Letter</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Submission History</button></nav>

      {tab === 'resume' && <>
        <section className="intake">
          <textarea placeholder="Paste the job description here" value={jobText} onChange={(e) => setJobText(e.target.value)} />
          <div className="intake-right">
            <input value={jobLink} onChange={(e) => setJobLink(e.target.value)} placeholder="or paste job link" />
            <button onClick={fetchFromUrl}>Import from URL</button>
            <input type="file" accept=".txt,.md,.rtf,.doc,.docx,.pdf" onChange={(e) => e.target.files && onUpload(e.target.files[0])} />
            <p className="upload-help">Upload your career history/CV source file.</p>
            <button className="primary" onClick={generateResume} disabled={analyzingRequirements}>{analyzingRequirements ? 'Running Agents…' : 'Generate Resume'}</button>
            <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateName)}>{TEMPLATES.map((name) => <option key={name} value={name}>{name} Template</option>)}</select>
            <button onClick={saveToHistory}>Save to History</button>
          </div>
        </section>

        <section className="workspace">
          <aside className="skills-panel">
            <h3>Experience Repository</h3>
            <div className="filters-line"><select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>{companies.map((company) => <option key={company} value={company}>{company}</option>)}</select><select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>{skills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}</select><button onClick={applySelectedExperience}>Apply Selected Bullets</button></div>
            <div className="experience-list">{filteredExperience.map((item) => <label key={item.id}><input type="checkbox" checked={item.selected} onChange={() => toggleExperience(item.id)} /><span>{item.text}</span><small>{item.company} • {item.skillTags.join(', ')}</small></label>)}</div>
          </aside>

          <main ref={previewRef} className={`resume-preview ${template.toLowerCase()} ${previewFullscreen ? 'is-fullscreen' : ''}`}>
            <div className="preview-toolbar"><button onClick={() => setZoom((prev) => Math.max(0.7, Number((prev - 0.1).toFixed(1))))}>Zoom out</button><button onClick={() => setZoom((prev) => Math.min(1.5, Number((prev + 0.1).toFixed(1))))}>Zoom in</button><button onClick={() => setEditMode((prev) => !prev)}>{editMode ? 'Done editing' : 'Edit sections'}</button><button onClick={() => setSectionPickerOpen((prev) => !prev)}>{sectionPickerOpen ? 'Close section chooser' : 'Choose sections'}</button><button className="toolbar-right" onClick={togglePreviewFullscreen}>{previewFullscreen ? 'Exit full screen' : 'Full screen'}</button></div>

            {sectionPickerOpen && <div className="section-picker"><div className="section-picker-header"><strong>Choose section</strong><button onClick={() => setSectionsCollapsed((prev) => !prev)}>{sectionsCollapsed ? 'Expand top section' : 'Collapse top section'}</button></div>{!sectionsCollapsed && <div className="section-picker-row top-section-row"><label><input type="checkbox" checked={sectionMap.header.visible} onChange={() => toggleSection('header')} />Show</label><input value={sectionMap.header.label} onChange={(e) => updateSectionLabel('header', e.target.value)} /></div>}{sections.filter((section) => section.id !== 'header').map((section) => <div key={section.id} className="section-picker-row"><label><input type="checkbox" checked={section.visible} onChange={() => toggleSection(section.id)} />Show</label><input value={section.label} onChange={(e) => updateSectionLabel(section.id, e.target.value)} /></div>)}</div>}

            <div className="preview-frame"><div className="preview-content" style={{ transform: `scale(${zoom})` }}>
              {sectionMap.header.visible && <><h2>{resume.fullName || 'Your Name'}</h2><p>{resume.email} | {resume.phone} | {resume.location}</p><h3>{resume.targetRole || 'Target Role'}</h3></>}
              {sectionMap.summary.visible && <><h4>{sectionMap.summary.label}</h4>{editMode ? <textarea value={resume.summary} onChange={(e) => setResume((prev) => ({ ...prev, summary: e.target.value }))} /> : <p className="preview-text">{resume.summary}</p>}</>}
              {sectionMap.skills.visible && <><h4>{sectionMap.skills.label}</h4>{editMode ? <textarea value={resume.keySkills.join(', ')} onChange={(e) => setResume((prev) => ({ ...prev, keySkills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} /> : <p className="preview-text">{resume.keySkills.join(' • ')}</p>}</>}
              {sectionMap.experience.visible && <><h4>{sectionMap.experience.label}</h4>{resume.selectedExperience.map((item, idx) => <div className="bullet-row" key={item.id}>{editMode ? <textarea value={item.text} onChange={(e) => setResume((prev) => ({ ...prev, selectedExperience: prev.selectedExperience.map((entry) => entry.id === item.id ? { ...entry, text: e.target.value } : entry) }))} /> : <p className="preview-bullet">• {item.text}</p>}{editMode && <div className="move-controls"><button onClick={() => moveBullet(idx, 'up')}>↑</button><button onClick={() => moveBullet(idx, 'down')}>↓</button></div>}</div>)}</>}

              {sectionMap.insights.visible && <div className="insights"><h4>{sectionMap.insights.label}</h4><div className="tabs mini-tabs">{(['soft', 'hard', 'reviews', 'salary', 'values'] as InsightTab[]).map((name) => <button key={name} className={insightTab === name ? 'active' : ''} onClick={() => setInsightTab(name)}>{name}</button>)}</div><ul>{(insightData[insightTab] || []).map((insight) => <li key={insight}>{insight}</li>)}</ul></div>}

              {sectionMap.checklist.visible && <div className="requirements-checklist"><div className="checklist-header"><h4>{sectionMap.checklist.label}</h4><button className="primary" disabled={analyzingRequirements} onClick={runCheckerOnly}>{analyzingRequirements ? 'Checking…' : 'Generate Check'}</button></div>{requirementChecks.length === 0 ? <p className="checklist-empty">No score yet. Generate check to run Agent 5.</p> : <ul>{requirementChecks.map((check) => <li key={check.id} className={scoreClass(check.score)}><span><input type="checkbox" checked={check.score >= 75} readOnly /> {check.requirement}</span><small>Score: {check.score}/100 · {check.reason}</small></li>)}</ul>}</div>}
            </div></div>
          </main>
        </section>
      </>}

      {tab === 'coverLetter' && <section className="cover-letter"><div><h3>Notes to include</h3><textarea value={coverLetterNotes} onChange={(e) => setCoverLetterNotes(e.target.value)} /><button className="primary" onClick={generateCoverLetter}>Generate Cover Letter</button></div><div><h3>Preview</h3><textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} /></div></section>}
      {tab === 'history' && <section className="history"><table><thead><tr><th>Date</th><th>Role</th><th>Company</th><th>Template</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{new Date(item.date).toLocaleString()}</td><td>{item.role}</td><td>{item.company}</td><td>{item.template}</td></tr>)}</tbody></table></section>}

      <button className="chat-toggle" onClick={() => setChatOpen((v) => !v)}>💬</button>
      {chatOpen && <section className="chat-box"><h4>Agent 6 Side Chat</h4><div className="chat-feed">{chatMessages.map((msg) => <p key={msg}>{msg}</p>)}</div><textarea placeholder="Answer missing-info questions here" value={chatInput} onChange={(e) => setChatInput(e.target.value)} /><button className="primary" onClick={submitGapAnswer}>Send to Refiner</button></section>}
    </div>
  )
}

export default App
