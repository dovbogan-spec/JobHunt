import { createHash, randomUUID } from "node:crypto";
import { actionablePointsSchema, cvDraftSchema, jdParsedSchema, parsedExperienceSchema, skillScoresSchema } from "../../shared/schemas/contracts.js";
import { generateText } from "../llm/openai.js";

type AgentContext = {
  runId: string;
  inputs: Record<string, any>;
  context: { run: Record<string, any> | null; artifacts: Array<{ type: string; data: any }> };
};

type AgentResult = {
  ok: boolean;
  artifactUpdates: Array<{ type: string; data: unknown }>;
  nextHints: string[];
  errors: string[];
  meta?: { inputHash?: string };
};

type AgentDefinition = { name: string; run: (ctx: AgentContext) => Promise<AgentResult> };

const SKILL_RX = /(react|typescript|javascript|node|python|aws|docker|kubernetes|sql|leadership|communication|testing)/gi;
const getArtifact = (arts: Array<{ type: string; data: any }>, type: string) => arts.find((a) => a.type === type)?.data;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

const agent1: AgentDefinition = {
  name: "agent_1_jd_parser",
  async run(ctx) {
    const jd = String(ctx.inputs.jd_text || "").trim();
    const skills = Array.from(new Set((jd.match(SKILL_RX) || []).map((s) => s.toLowerCase())));
    const parsed = jdParsedSchema.parse({
      title: jd.split("\n")[0]?.slice(0, 120) || "Job Description",
      company: "",
      location: "",
      skills,
      responsibilities: jd.split(/[\n\.]/).map((s) => s.trim()).filter(Boolean).slice(0, 8),
      normalizedText: jd,
    });
    return { ok: true, artifactUpdates: [{ type: "parsed_jd", data: parsed }], nextHints: [], errors: [], meta: { inputHash: hash({ jd }) } };
  },
};

const agent2: AgentDefinition = {
  name: "agent_2_experience_ingestion",
  async run(ctx) {
    const text = String(ctx.inputs.experience_text || "").trim();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const skills = Array.from(new Set((text.match(SKILL_RX) || []).map((s) => s.toLowerCase())));
    return {
      ok: true,
      artifactUpdates: [{ type: "parsed_experience", data: parsedExperienceSchema.parse({ summary: lines[0] || "", lines: lines.slice(0, 120), skills }) }],
      nextHints: [],
      errors: [],
      meta: { inputHash: hash({ text }) },
    };
  },
};

const agent3: AgentDefinition = {
  name: "agent_3_actionable_points",
  async run(ctx) {
    const text = String(ctx.inputs.life_story || ctx.inputs.experience_text || "");
    const bullets = text.split(/\n|\./).map((s) => s.trim()).filter((s) => s.length > 20).slice(0, 8).map((line) => ({
      action: line,
      impact: "Delivered measurable outcomes",
      scope: "Cross-functional scope",
      skillTags: Array.from(new Set((line.match(SKILL_RX) || []).map((s) => s.toLowerCase()))),
    }));
    let draft = { companies: [{ company: "Recent Experience", roles: [{ role: "Contributor", bullets }] }] };
    if (process.env.OPENAI_API_KEY && text.length > 40) {
      try {
        const response = await generateText("Return concise structured bullet improvements.", `Experience:\n${text.slice(0, 4000)}`);
        if (response) draft.companies[0].roles[0].bullets[0] = { ...draft.companies[0].roles[0].bullets[0], impact: response.slice(0, 200) };
      } catch {
        // deterministic fallback already set
      }
    }
    return { ok: true, artifactUpdates: [{ type: "actionable_points", data: actionablePointsSchema.parse(draft) }], nextHints: [], errors: [], meta: { inputHash: hash({ text }) } };
  },
};

const agent4: AgentDefinition = {
  name: "agent_4_cv_builder",
  async run(ctx) {
    const parsedJd = getArtifact(ctx.context.artifacts, "parsed_jd") || {};
    const points = getArtifact(ctx.context.artifacts, "actionable_points") || { companies: [] };
    const bullets = (points.companies || []).flatMap((c: any) => (c.roles || []).flatMap((r: any) => (r.bullets || []).map((b: any) => `${b.action} — ${b.impact}`)));
    const skills = new Set<string>((parsedJd.skills || []).map((s: string) => s.toLowerCase()));
    const evidence = bullets.join(" ").toLowerCase();
    const scores = Array.from(skills).map((skill) => {
      const count = evidence.includes(skill) ? 1 : 0;
      return { skillTag: skill, evidenceCount: count, score: count ? 75 : 0, status: count ? "weak" : "missing" };
    });

    const cvDraft = cvDraftSchema.parse({
      candidateName: ctx.context.run?.candidate_name || "Candidate",
      headline: parsedJd.title || "Target Role",
      sections: [
        { key: "summary", title: "Summary", items: [String(parsedJd.normalizedText || "").slice(0, 240)] },
        { key: "experience", title: "Experience", items: bullets.slice(0, 10) },
      ],
      updatedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      artifactUpdates: [
        { type: "cv_draft", data: cvDraft },
        { type: "skill_scores", data: skillScoresSchema.parse({ scores }) },
      ],
      nextHints: [],
      errors: [],
      meta: { inputHash: hash({ parsedJd, points, template: ctx.context.run?.selected_template }) },
    };
  },
};

const orderedAgents = [agent1, agent2, agent3, agent4] as const;
export function getAgentForStep(stepIndex: number) { return orderedAgents[stepIndex - 1] ?? null; }
export function maxSteps() { return orderedAgents.length; }
export function newRevisionId() { return randomUUID(); }
