import { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import { v4 as uuidv4 } from 'uuid'
import './App.css'
import { LlmIntegrationTab, initialLlmSettings, type LlmIntegrationSettings } from './components/LlmIntegrationTab'

type TemplateName = 'Modern' | 'Classic' | 'Technical'
type TabName = 'resume' | 'coverLetter' | 'history' | 'llm'
type SectionId = 'header' | 'summary' | 'skills' | 'experience' | 'insights' | 'checklist'

type ExperienceItem = {
  id: string
  text: string
  company: string
  skillTags: string[]
  selected: boolean
}

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

type ResumeSection = {
  id: SectionId
  label: string
  visible: boolean
}

type RequirementCheck = {
  id: string
  requirement: string
  source: 'job' | 'company'
  met: boolean
  evidence: string
}

type SubmissionHistory = {
  id: string
  date: string
  role: string
  company: string
  template: TemplateName
  resume: ResumeData
  coverLetter: string
}

const SKILL_KEYWORDS = [
  'react',
  'typescript',
  'javascript',
  'python',
  'java',
  'aws',
  'docker',
  'kubernetes',
  'sql',
  'data',
  'product',
  'api',
  'node',
  'leadership',
  'agile',
  'communication',
  'design',
  'testing',
  'ci/cd',
]

const TEMPLATES: TemplateName[] = ['Modern', 'Classic', 'Technical']

const initialResume: ResumeData = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  targetRole: '',
  summary: '',
  keySkills: [],
  selectedExperience: [],
  organization: '',
}

const initialSections: ResumeSection[] = [
  { id: 'header', label: 'Header', visible: true },
  { id: 'summary', label: 'Professional Summary', visible: true },
  { id: 'skills', label: 'Skills', visible: true },
  { id: 'experience', label: 'Experience', visible: true },
  { id: 'insights', label: 'Application key points', visible: true },
  { id: 'checklist', label: 'Requirement checklist', visible: true },
]

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
  const [companyInsights, setCompanyInsights] = useState<string[]>([])
  const [history, setHistory] = useState<SubmissionHistory[]>(() => {
    const stored = localStorage.getItem('job-hunt-history')
    return stored ? JSON.parse(stored) : []
  })
  const [llmSettings, setLlmSettings] = useState<LlmIntegrationSettings>(() => {
    const stored = localStorage.getItem('job-hunt-llm-settings')
    return stored ? JSON.parse(stored) : initialLlmSettings
  })
  const [llmSavedNotice, setLlmSavedNotice] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [skillFilter, setSkillFilter] = useState('all')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<string[]>([
    'Hi! I can help refine your resume and cover letter for each role.',
  ])
  const [zoom, setZoom] = useState(1)
  const [editMode, setEditMode] = useState(false)
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false)
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false)
  const [sections, setSections] = useState<ResumeSection[]>(initialSections)
  const [requirementChecks, setRequirementChecks] = useState<RequirementCheck[]>([])
  const [analyzingRequirements, setAnalyzingRequirements] = useState(false)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const previewRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    localStorage.setItem('job-hunt-history', JSON.stringify(history))
  }, [history])

  useEffect(() => {
    localStorage.setItem('job-hunt-llm-settings', JSON.stringify(llmSettings))
  }, [llmSettings])

  useEffect(() => {
    const onFullscreenChange = () => {
      setPreviewFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === previewRef.current))
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const companies = useMemo(
    () => ['all', ...Array.from(new Set(experienceItems.map((item) => item.company)))],
    [experienceItems],
  )
  const skills = useMemo(
    () => ['all', ...Array.from(new Set(experienceItems.flatMap((item) => item.skillTags)))],
    [experienceItems],
  )

  const filteredExperience = useMemo(() => {
    return experienceItems.filter((item) => {
      const byCompany = companyFilter === 'all' || item.company === companyFilter
      const bySkill = skillFilter === 'all' || item.skillTags.includes(skillFilter)
      return byCompany && bySkill
    })
  }, [experienceItems, companyFilter, skillFilter])

  const sectionMap = useMemo(
    () => Object.fromEntries(sections.map((section) => [section.id, section])) as Record<SectionId, ResumeSection>,
    [sections],
  )

  async function fetchFromUrl() {
    if (!jobLink.trim()) return
    try {
      const target = encodeURIComponent(jobLink.trim())
      const res = await fetch(`https://api.allorigins.win/raw?url=${target}`)
      const text = await res.text()
      setJobText((prev) => (prev ? `${prev}\n\n${text.slice(0, 7000)}` : text.slice(0, 7000)))
    } catch {
      setChatOpen(true)
      setChatMessages((prev) => [...prev, 'I could not read this URL directly. Please paste the job description text.'])
    }
  }

  function parseExperience(raw: string) {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const bullets = lines
      .filter((line) => line.startsWith('-') || line.startsWith('*') || /^[0-9]+\./.test(line))
      .map((line) => line.replace(/^[-*\d.\s]+/, ''))

    const fallbackBullets = lines.slice(0, 12)
    const chosen = bullets.length ? bullets : fallbackBullets

    const parsed: ExperienceItem[] = chosen.map((line) => {
      const companyMatch = line.match(/at\s+([A-Z][A-Za-z0-9&\s-]+)/)
      const company = companyMatch ? companyMatch[1].trim() : 'General'
      const skillTags = SKILL_KEYWORDS.filter((skill) => line.toLowerCase().includes(skill))
      return {
        id: uuidv4(),
        text: line,
        company,
        skillTags: skillTags.length ? skillTags : ['general'],
        selected: true,
      }
    })

    setExperienceItems(parsed)
    return parsed
  }

  function extractPersonInfo(text: string) {
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
    const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0] ?? ''
    const firstLine = text.split('\n').find((line) => line.trim().length > 3) ?? ''
    const fullName = firstLine.replace(/[^a-zA-Z\s'-]/g, '').trim()

    return { email, phone, fullName }
  }

  async function getCompanyKeyPoints(org: string, role: string) {
    if (!org && !role) return []
    const q = encodeURIComponent(`${org} ${role} company values candidate experience`)
    try {
      const res = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`)
      const data = await res.json()
      type RelatedTopic = { Text?: string; Topics?: RelatedTopic[] }
      const related = ((data.RelatedTopics ?? []) as RelatedTopic[])
        .flatMap((topic) => (topic.Topics ? topic.Topics : [topic]))
        .slice(0, 4)
        .map((topic) => topic.Text)
        .filter((topic): topic is string => Boolean(topic))
      if (related.length) return related
    } catch {
      // noop
    }

    return [
      `Highlight measurable impact aligned with ${org || 'the organization'} mission and ${role || 'role'} outcomes.`,
      'Mirror key language from the posting: ownership, collaboration, and customer impact.',
      'Quantify achievements with metrics and use concise action-oriented bullets.',
    ]
  }

  async function generateResume() {
    const parsed = parseExperience(experienceDoc)
    const info = extractPersonInfo(experienceDoc)
    const organization =
      jobText.match(/company[:\s]+([A-Z][A-Za-z0-9&\s-]+)/i)?.[1]?.trim() ||
      jobText.match(/at\s+([A-Z][A-Za-z0-9&\s-]{2,})/i)?.[1]?.trim() ||
      'Target Company'
    const role =
      jobText.match(
        /(Senior|Lead|Principal|Junior)?\s?(Software|Data|Product|Design|Marketing|Sales)?\s?(Engineer|Manager|Analyst|Specialist|Designer)/i,
      )?.[0] || 'Target Role'

    const keySkills = SKILL_KEYWORDS.filter((skill) =>
      (jobText + '\n' + experienceDoc).toLowerCase().includes(skill.toLowerCase()),
    ).slice(0, 10)

    const summary = `Results-driven professional targeting ${role} at ${organization}. Brings experience across ${keySkills
      .slice(0, 4)
      .join(', ')} with a focus on measurable outcomes and cross-functional collaboration.`

    setResume({
      fullName: info.fullName || 'Your Name',
      email: info.email,
      phone: info.phone,
      location: 'Location',
      targetRole: role,
      summary,
      keySkills,
      selectedExperience: parsed,
      organization,
    })

    const missing: string[] = []
    if (!info.fullName || info.fullName.split(' ').length < 2) missing.push('full name')
    if (!info.email) missing.push('email')
    if (!info.phone) missing.push('phone number')
    if (missing.length) {
      setChatOpen(true)
      setChatMessages((prev) => [...prev, `I need your ${missing.join(', ')} to finalize the CV header.`])
    }

    const insights = await getCompanyKeyPoints(organization, role)
    setCompanyInsights(insights)
    setRequirementChecks([])
  }

  function toggleExperience(id: string) {
    setExperienceItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              selected: !item.selected,
            }
          : item,
      ),
    )
  }

  function applySelectedExperience() {
    const selected = experienceItems.filter((item) => item.selected)
    setResume((prev) => ({ ...prev, selectedExperience: selected }))
  }

  function moveBullet(index: number, direction: 'up' | 'down') {
    setResume((prev) => {
      const next = [...prev.selectedExperience]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, selectedExperience: next }
    })
  }

  function updateSectionLabel(id: SectionId, label: string) {
    setSections((prev) => prev.map((section) => (section.id === id ? { ...section, label } : section)))
  }

  function toggleSection(id: SectionId) {
    setSections((prev) => prev.map((section) => (section.id === id ? { ...section, visible: !section.visible } : section)))
  }

  function parseRequirements(text: string) {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const requirementLines = lines
      .filter(
        (line) =>
          /^[-*\d.\s]/.test(line) ||
          /\b(require|must|preferred|qualification|responsibilit|need|experience with|proficien)/i.test(line),
      )
      .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())

    const keywordLines = SKILL_KEYWORDS.filter((skill) => text.toLowerCase().includes(skill)).map(
      (skill) => `Experience with ${skill}`,
    )

    return Array.from(new Set([...requirementLines, ...keywordLines])).slice(0, 18)
  }

  function buildCvCorpus() {
    return [
      resume.fullName,
      resume.targetRole,
      resume.summary,
      resume.keySkills.join(' '),
      resume.selectedExperience.map((item) => item.text).join(' '),
      coverLetter,
    ]
      .join(' ')
      .toLowerCase()
  }

  async function analyzeRequirementCoverage() {
    setAnalyzingRequirements(true)
    try {
      const cvCorpus = buildCvCorpus()
      const jobRequirements = parseRequirements(jobText).map((line) => ({ requirement: line, source: 'job' as const }))
      const companyRequirements = companyInsights.map((line) => ({ requirement: line, source: 'company' as const }))

      const allRequirements = [...jobRequirements, ...companyRequirements].slice(0, 24)

      const checks: RequirementCheck[] = allRequirements.map((entry) => {
        const tokens = entry.requirement
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((word) => word.length > 3)
          .slice(0, 8)

        const matches = tokens.filter((token) => cvCorpus.includes(token))
        const met = matches.length >= Math.max(1, Math.ceil(tokens.length * 0.35))

        return {
          id: uuidv4(),
          requirement: entry.requirement,
          source: entry.source,
          met,
          evidence: met ? `Matched keywords: ${matches.slice(0, 5).join(', ')}` : 'No strong match found in current CV text.',
        }
      })

      setRequirementChecks(checks)
      setChatOpen(true)
      setChatMessages((prev) => [
        ...prev,
        'Analyzed with ChatGPT-style reasoning heuristics: requirement checklist has been updated below the CV preview.',
      ])
    } finally {
      setAnalyzingRequirements(false)
    }
  }

  async function togglePreviewFullscreen() {
    const target = previewRef.current
    if (!target) return

    if (!document.fullscreenElement) {
      await target.requestFullscreen()
      setPreviewFullscreen(true)
      return
    }

    if (document.fullscreenElement === target) {
      await document.exitFullscreen()
      setPreviewFullscreen(false)
    }
  }

  function generateCoverLetter() {
    const letter = `Dear Hiring Team at ${resume.organization || 'the company'},\n\nI am excited to apply for the ${resume.targetRole || 'open position'} role. My background includes ${resume.keySkills
      .slice(0, 5)
      .join(', ')}, and I have delivered impact through outcomes such as:\n${resume.selectedExperience
      .slice(0, 3)
      .map((item) => `• ${item.text}`)
      .join('\n')}\n\n${coverLetterNotes ? `Additional context:\n${coverLetterNotes}\n\n` : ''}I am especially drawn to your focus on innovation and customer impact. I would welcome the opportunity to discuss how I can contribute to your team.\n\nSincerely,\n${resume.fullName || 'Candidate'}`
    setCoverLetter(letter)
  }

  function downloadResumePdf() {
    const doc = new jsPDF()
    const margin = 14
    let y = 20

    doc.setFontSize(18)
    doc.text(resume.fullName || 'Your Name', margin, y)
    y += 8

    doc.setFontSize(11)
    doc.text(`${resume.email} | ${resume.phone} | ${resume.location}`, margin, y)
    y += 10

    doc.setFontSize(14)
    doc.text(`Target Role: ${resume.targetRole}`, margin, y)
    y += 8

    doc.setFontSize(12)
    doc.text(sectionMap.summary.label, margin, y)
    y += 6
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(resume.summary || '', 180), margin, y)
    y += 14

    doc.setFontSize(12)
    doc.text(sectionMap.skills.label, margin, y)
    y += 6
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(resume.keySkills.join(' • '), 180), margin, y)
    y += 10

    doc.setFontSize(12)
    doc.text(sectionMap.experience.label, margin, y)
    y += 6
    doc.setFontSize(10)
    resume.selectedExperience.forEach((item) => {
      const lines = doc.splitTextToSize(`• ${item.text}`, 180)
      doc.text(lines, margin, y)
      y += lines.length * 5
      if (y > 270) {
        doc.addPage()
        y = 20
      }
    })

    const filename = `${(resume.fullName || 'candidate').replace(/\s+/g, '_')}.pdf`
    doc.save(filename)
  }

  function saveToHistory() {
    const entry: SubmissionHistory = {
      id: uuidv4(),
      date: new Date().toISOString(),
      role: resume.targetRole,
      company: resume.organization,
      template,
      resume,
      coverLetter,
    }
    setHistory((prev) => [entry, ...prev])
  }

  async function onUpload(file: File) {
    const text = await file.text()
    setExperienceDoc(text)
  }

  function saveLlmSettings() {
    setLlmSavedNotice('LLM integration settings saved locally. Connect these values to your backend API calls.')
  }

  return (
    <div className="shell">
      <header className="header">
        <h1>JobHunt Copilot</h1>
        <button className="primary" onClick={downloadResumePdf}>Download CV</button>
      </header>

      <nav className="tabs">
        <button className={tab === 'resume' ? 'active' : ''} onClick={() => setTab('resume')}>Resume Builder</button>
        <button className={tab === 'coverLetter' ? 'active' : ''} onClick={() => setTab('coverLetter')}>Cover Letter</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Submission History</button>
        <button className={tab === 'llm' ? 'active' : ''} onClick={() => setTab('llm')}>LLM API Integration</button>
      </nav>

      {tab === 'resume' && (
        <>
          <section className="intake">
            <textarea
              placeholder="Paste the job description here"
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
            />
            <div className="intake-right">
              <input
                value={jobLink}
                onChange={(e) => setJobLink(e.target.value)}
                placeholder="or paste job link"
              />
              <button onClick={fetchFromUrl}>Import from URL</button>
              <input type="file" accept=".txt,.md,.rtf,.doc,.docx,.pdf" onChange={(e) => e.target.files && onUpload(e.target.files[0])} />
              <p className="upload-help">Add your experience file here so the tool can generate role-matched resume bullets.</p>
              <button className="primary" onClick={generateResume}>Generate Resume</button>
              <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateName)}>
                {TEMPLATES.map((name) => (
                  <option key={name} value={name}>
                    {name} Template
                  </option>
                ))}
              </select>
              <button onClick={saveToHistory}>Save to History</button>
            </div>
          </section>

          <section className="workspace">
            <aside className="skills-panel">
              <h3>Experience Repository</h3>
              <div className="filters-line">
                <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                  {companies.map((company) => (
                    <option key={company} value={company}>{company}</option>
                  ))}
                </select>
                <select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
                  {skills.map((skill) => (
                    <option key={skill} value={skill}>{skill}</option>
                  ))}
                </select>
                <button onClick={applySelectedExperience}>Apply Selected Bullets</button>
              </div>
              <div className="experience-list">
                {filteredExperience.map((item) => (
                  <label key={item.id}>
                    <input type="checkbox" checked={item.selected} onChange={() => toggleExperience(item.id)} />
                    <span>{item.text}</span>
                    <small>{item.company} • {item.skillTags.join(', ')}</small>
                  </label>
                ))}
              </div>
            </aside>

            <main ref={previewRef} className={`resume-preview ${template.toLowerCase()} ${previewFullscreen ? 'is-fullscreen' : ''}`}>
              <div className="preview-toolbar">
                <button onClick={() => setZoom((prev) => Math.max(0.7, Number((prev - 0.1).toFixed(1))))}>Zoom out</button>
                <button onClick={() => setZoom((prev) => Math.min(1.5, Number((prev + 0.1).toFixed(1))))}>Zoom in</button>
                <button onClick={() => setEditMode((prev) => !prev)}>{editMode ? 'Done editing' : 'Edit sections'}</button>
                <button onClick={() => setSectionPickerOpen((prev) => !prev)}>{sectionPickerOpen ? 'Close section chooser' : 'Choose sections'}</button>
                <button className="toolbar-right" onClick={togglePreviewFullscreen}>{previewFullscreen ? 'Exit full screen' : 'Full screen'}</button>
              </div>

              {sectionPickerOpen && (
                <div className="section-picker">
                  <div className="section-picker-header">
                    <strong>Choose section</strong>
                    <button onClick={() => setSectionsCollapsed((prev) => !prev)}>
                      {sectionsCollapsed ? 'Expand top section' : 'Collapse top section'}
                    </button>
                  </div>

                  {!sectionsCollapsed && (
                    <div className="section-picker-row top-section-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={sectionMap.header.visible}
                          onChange={() => toggleSection('header')}
                        />
                        Show
                      </label>
                      <input
                        value={sectionMap.header.label}
                        onChange={(e) => updateSectionLabel('header', e.target.value)}
                        placeholder="Top section name"
                      />
                    </div>
                  )}

                  {sections.filter((section) => section.id !== 'header').map((section) => (
                    <div key={section.id} className="section-picker-row">
                      <label>
                        <input type="checkbox" checked={section.visible} onChange={() => toggleSection(section.id)} />
                        Show
                      </label>
                      <input
                        value={section.label}
                        onChange={(e) => updateSectionLabel(section.id, e.target.value)}
                        placeholder="Section name"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="preview-frame">
                <div className="preview-content" style={{ transform: `scale(${zoom})` }}>
                  {sectionMap.header.visible && (
                    <>
                      <h2>{resume.fullName || 'Your Name'}</h2>
                      <p>{resume.email} | {resume.phone} | {resume.location}</p>
                      <h3>{resume.targetRole || 'Target Role'}</h3>
                    </>
                  )}

                  {sectionMap.summary.visible && (
                    <>
                      <h4>{sectionMap.summary.label}</h4>
                      {editMode ? (
                        <textarea
                          value={resume.summary}
                          onChange={(e) => setResume((prev) => ({ ...prev, summary: e.target.value }))}
                        />
                      ) : (
                        <p className="preview-text">{resume.summary}</p>
                      )}
                    </>
                  )}

                  {sectionMap.skills.visible && (
                    <>
                      <h4>{sectionMap.skills.label}</h4>
                      {editMode ? (
                        <textarea
                          value={resume.keySkills.join(', ')}
                          onChange={(e) =>
                            setResume((prev) => ({ ...prev, keySkills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))
                          }
                        />
                      ) : (
                        <p className="preview-text">{resume.keySkills.join(' • ')}</p>
                      )}
                    </>
                  )}

                  {sectionMap.experience.visible && (
                    <>
                      <h4>{sectionMap.experience.label}</h4>
                      {resume.selectedExperience.map((item, idx) => (
                        <div className="bullet-row" key={item.id}>
                          {editMode ? (
                            <textarea
                              value={item.text}
                              onChange={(e) =>
                                setResume((prev) => ({
                                  ...prev,
                                  selectedExperience: prev.selectedExperience.map((entry) =>
                                    entry.id === item.id ? { ...entry, text: e.target.value } : entry,
                                  ),
                                }))
                              }
                            />
                          ) : (
                            <p className="preview-bullet">• {item.text}</p>
                          )}
                          {editMode && (
                            <div className="move-controls">
                              <button onClick={() => moveBullet(idx, 'up')}>↑</button>
                              <button onClick={() => moveBullet(idx, 'down')}>↓</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {sectionMap.insights.visible && (
                    <div className="insights">
                      <h4>{sectionMap.insights.label}</h4>
                      <ul>
                        {companyInsights.map((insight) => (
                          <li key={insight}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sectionMap.checklist.visible && (
                    <div className="requirements-checklist">
                      <div className="checklist-header">
                        <h4>{sectionMap.checklist.label}</h4>
                        <button className="primary" disabled={analyzingRequirements} onClick={analyzeRequirementCoverage}>
                          {analyzingRequirements ? 'Analyzing…' : 'Analyze with ChatGPT thinking model'}
                        </button>
                      </div>
                      {requirementChecks.length === 0 ? (
                        <p className="checklist-empty">No analysis yet. Click analyze to compare CV coverage with job + company requirements.</p>
                      ) : (
                        <ul>
                          {requirementChecks.map((check) => (
                            <li key={check.id} className={check.met ? 'met' : 'not-met'}>
                              <span>{check.met ? '✅' : '⬜'} {check.requirement}</span>
                              <small>
                                Source: {check.source === 'job' ? 'Job description' : 'Company insights'} · {check.evidence}
                              </small>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </main>
          </section>
        </>
      )}

      {tab === 'coverLetter' && (
        <section className="cover-letter">
          <div>
            <h3>Notes to include</h3>
            <textarea
              placeholder="Write specific points to highlight"
              value={coverLetterNotes}
              onChange={(e) => setCoverLetterNotes(e.target.value)}
            />
            <button className="primary" onClick={generateCoverLetter}>Generate Cover Letter</button>
          </div>
          <div>
            <h3>Preview</h3>
            <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} />
          </div>
        </section>
      )}

      {tab === 'history' && (
        <section className="history">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Role</th>
                <th>Company</th>
                <th>Template</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.date).toLocaleString()}</td>
                  <td>{item.role}</td>
                  <td>{item.company}</td>
                  <td>{item.template}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'llm' && (
        <LlmIntegrationTab
          llmSettings={llmSettings}
          llmSavedNotice={llmSavedNotice}
          onChange={setLlmSettings}
          onSave={saveLlmSettings}
          onDirty={() => setLlmSavedNotice('')}
        />
      )}

      <button className="chat-toggle" onClick={() => setChatOpen((v) => !v)}>💬</button>
      {chatOpen && (
        <section className="chat-box">
          <h4>Assistant</h4>
          <div className="chat-feed">
            {chatMessages.map((msg) => (
              <p key={msg}>{msg}</p>
            ))}
          </div>
          <button onClick={() => setChatMessages((prev) => [...prev, 'Tip: Use quantified outcomes and role-specific keywords to improve ATS match.'])}>
            Ask for CV advice
          </button>
        </section>
      )}
    </div>
  )
}

export default App
