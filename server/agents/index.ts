import { readFile } from "node:fs/promises";
import path from "node:path";

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

type AgentDefinition = {
  name: string;
  promptFile: string;
  artifactType: string;
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

function createAgent(name: string, promptFile: string, artifactType: string): AgentDefinition {
  return {
    name,
    promptFile,
    artifactType,
    async run(ctx) {
      const prompt = await loadPrompt(promptFile);
      const data = {
        promptVersion: prompt.slice(0, 200),
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
  createAgent("agent_1_jd_parser", "agent1.prompt.txt", "parsed_jd"),
  createAgent("agent_2_experience_extractor", "agent2.prompt.txt", "parsed_experience"),
  createAgent("agent_3_tagger", "agent3.prompt.txt", "tagged_bullets"),
  createAgent("agent_4_resume_draft", "agent4.prompt.txt", "resume_draft"),
  createAgent("agent_5_cover_letter", "agent5.prompt.txt", "cover_letter_draft"),
  createAgent("agent_6_assistant_qa", "agent6.prompt.txt", "assistant_qa"),
] as const;

export function getAgentForStep(stepIndex: number) {
  return orderedAgents[stepIndex - 1] ?? null;
}

export function maxSteps() {
  return orderedAgents.length;
}
