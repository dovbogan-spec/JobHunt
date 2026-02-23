import { readFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config/edgeConfig.js";

type AgentContext = {
  runId: string;
  inputs: Record<string, unknown>;
  context: Record<string, unknown>;
};

type AgentResult = {
  ok: boolean;
  artifactUpdates: Array<{ type: string; data: unknown }>;
  nextHints: string[];
  errors: string[];
};

type AgentRole = "planner" | "extractor" | "writer" | "verifier";

type AgentDefinition = {
  name: string;
  promptFile: string;
  artifactType: string;
  role: AgentRole;
  run: (ctx: AgentContext) => Promise<AgentResult>;
};

async function loadPrompt(fileName: string) {
  const promptPath = path.join(process.cwd(), "server", "agents", "prompts", fileName);
  return readFile(promptPath, "utf8");
}

function buildSummary(inputs: Record<string, unknown>, label: string) {
  const keys = Object.keys(inputs);
  return {
    label,
    receivedKeys: keys,
    generatedAt: new Date().toISOString(),
  };
}

function createAgent(name: string, promptFile: string, artifactType: string, role: AgentRole): AgentDefinition {
  return {
    name,
    promptFile,
    artifactType,
    role,
    async run(ctx) {
      const config = await getConfig();
      const fallbackModel = process.env.OPENAI_MODEL || "gpt-5.2";
      const model = config.defaultModels[role] ?? fallbackModel;
      const prompt = await loadPrompt(promptFile);
      const data = {
        promptVersion: prompt.slice(0, 200),
        model,
        ...buildSummary(ctx.inputs, artifactType),
      };
      return {
        ok: true,
        artifactUpdates: [{ type: artifactType, data }],
        nextHints: ["Agent completed successfully"],
        errors: [],
      };
    },
  };
}

const orderedAgents = [
  createAgent("agent_1_job_normalizer", "agent1.prompt.txt", "parsed_jd", "planner"),
  createAgent("agent_2_job_analysis", "agent2.prompt.txt", "parsed_experience", "extractor"),
  createAgent("agent_3_profile_parser", "agent3.prompt.txt", "tagged_bullets", "extractor"),
  createAgent("agent_4_cv_composer", "agent4.prompt.txt", "resume_draft", "writer"),
  createAgent("agent_5_cover_letter", "agent5.prompt.txt", "cover_letter_draft", "writer"),
  createAgent("agent_6_assistant_qa", "agent6.prompt.txt", "assistant_qa", "verifier"),
] as const;

export function getAgentForStep(stepIndex: number) {
  return orderedAgents[stepIndex - 1] ?? null;
}

export function maxSteps() {
  return orderedAgents.length;
}
