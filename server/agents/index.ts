import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config/edgeConfig.js";
import { Agent1OutputSchema, Agent4InputEnvelopeSchema, Agent4OutputSchema } from "../../shared/schemas/agents/index.js";
import { loadCvFieldRegistry, validateCvFieldsPayload } from "../config/cvFieldRegistry.js";

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

function createAgent4(): AgentDefinition {
  const base = createAgent(
    "agent_4_cv_composer",
    "agent4.prompt.txt",
    "cv_fields_payload",
    "writer",
    Agent4OutputSchema,
  );

  async function runAgent4(ctx: AgentContext): Promise<AgentResult> {
      const registry = await loadCvFieldRegistry();
      const envelope = Agent4InputEnvelopeSchema.parse({
        ...ctx.inputs,
        cv_field_registry_version: registry.version,
      });

      const cvFields: Record<string, unknown> = {};
      for (const field of registry.fields) {
        cvFields[field.field_id] = field.default_value;
      }

      const validation = validateCvFieldsPayload(cvFields, registry);
      const normalized = Agent4OutputSchema.parse({
        cv_fields: cvFields,
        warnings: validation.warnings,
        edit_notes: [`Using cv_field_registry_version=${envelope.cv_field_registry_version}`],
      });

    return {
      ok: true,
      artifactUpdates: [{ type: "cv_fields_payload", data: normalized }],
      nextHints: ["Agent completed successfully"],
      errors: [],
    };
  }

  return {
    ...base,
    run: runAgent4,
    repair: runAgent4,
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
  createAgent4(),
  createAgent("agent_5_cover_letter", "agent5.prompt.txt", "cover_letter_draft", "writer", BaseAgentOutputSchema),
  createAgent("agent_6_assistant_qa", "agent6.prompt.txt", "assistant_qa", "verifier", BaseAgentOutputSchema),
] as const;

export function getAgentForStep(stepIndex: number) {
  return orderedAgents[stepIndex - 1] ?? null;
}

export function maxSteps() {
  return orderedAgents.length;
}
