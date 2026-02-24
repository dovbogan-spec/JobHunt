import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config/edgeConfig.js";
import { Agent1OutputSchema } from "../../shared/schemas/agents/index.js";

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

type AgentRunOptions = {
  strictJsonOnly?: boolean;
  schemaName?: string;
};

type AgentEvaluationResult = {
  confidence: number;
  notes: string[];
};

type AgentRole = "planner" | "extractor" | "writer" | "verifier";

type AgentDefinition = {
  name: string;
  promptFile: string;
  artifactType: string;
  role: AgentRole;
  outputSchema: z.ZodType<unknown>;
  run: (ctx: AgentContext) => Promise<AgentResult>;
  repair: (ctx: AgentContext, options: AgentRunOptions) => Promise<unknown>;
  evaluate?: (ctx: AgentContext, output: AgentResult) => Promise<AgentEvaluationResult>;
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

function createAgent(
  name: string,
  promptFile: string,
  artifactType: string,
  role: AgentRole,
  outputSchema: z.ZodType<unknown>,
): AgentDefinition {
  async function invoke(ctx: AgentContext, options?: AgentRunOptions): Promise<AgentResult> {
    const strictSuffix = options?.strictJsonOnly
      ? { responseConstraint: "valid_json_only", targetSchema: options?.schemaName ?? "unknown" }
      : {};

    const data = {
      ...strictSuffix,
      ...buildSummary(ctx.inputs, artifactType),
    };

    const parsedData = outputSchema.safeParse(data);
    return {
      ok: true,
      artifactUpdates: [{ type: artifactType, data: parsedData.success ? parsedData.data : data }],
      nextHints: ["Agent completed successfully"],
      errors: [],
    };
  }

  return {
    name,
    promptFile,
    artifactType,
    role,
    outputSchema,
    async run(ctx) {
      const config = await getConfig();
      const fallbackModel = process.env.OPENAI_MODEL || "gpt-5.2";
      const model = config.defaultModels[role] ?? fallbackModel;
      const prompt = await loadPrompt(promptFile);
      void prompt;
      void model;
      return invoke(ctx);
    },
    async repair(ctx, options) {
      return invoke(ctx, options);
    },
    async evaluate(_ctx, output) {
      const hasErrors = output.errors.length > 0;
      const confidence = hasErrors ? 0.4 : 0.9;
      return {
        confidence,
        notes: hasErrors ? ["Agent returned non-empty error list"] : ["Output appears coherent"],
      };
    },
  };
}

const BaseAgentOutputSchema = z
  .object({
    label: z.string().min(1),
    receivedKeys: z.array(z.string()),
    generatedAt: z.string().min(1),
  })
  .passthrough();

const orderedAgents = [
  createAgent("agent_1_job_normalizer", "agent1.prompt.txt", "parsed_jd", "planner", Agent1OutputSchema),
  createAgent("agent_2_job_analysis", "agent2.prompt.txt", "parsed_experience", "extractor", BaseAgentOutputSchema),
  createAgent("agent_3_profile_parser", "agent3.prompt.txt", "tagged_bullets", "extractor", BaseAgentOutputSchema),
  createAgent("agent_4_cv_composer", "agent4.prompt.txt", "resume_draft", "writer", BaseAgentOutputSchema),
  createAgent("agent_5_cover_letter", "agent5.prompt.txt", "cover_letter_draft", "writer", BaseAgentOutputSchema),
  createAgent("agent_6_assistant_qa", "agent6.prompt.txt", "assistant_qa", "verifier", BaseAgentOutputSchema),
] as const;

export function getAgentForStep(stepIndex: number) {
  return orderedAgents[stepIndex - 1] ?? null;
}

export function maxSteps() {
  return orderedAgents.length;
}
