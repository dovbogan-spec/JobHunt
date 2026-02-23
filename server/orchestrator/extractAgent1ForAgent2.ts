import { Agent1OutputSchema, Agent2InputSchema, type Agent2Input } from "../../shared/schemas/agents/index.js";

type ExtractionFailure = {
  ok: false;
  reason: {
    code: "agent1_output_invalid" | "agent2_input_invalid";
    message: string;
    details?: unknown;
  };
};

type ExtractionSuccess = {
  ok: true;
  data: Agent2Input;
};

export type Agent1ToAgent2ExtractionResult = ExtractionSuccess | ExtractionFailure;

function formatIssues(issues: Array<{ path: (string | number)[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
}

export function extractAgent1ForAgent2(agent1RawOutput: unknown): Agent1ToAgent2ExtractionResult {
  const parsedAgent1 = Agent1OutputSchema.safeParse(agent1RawOutput);
  if (!parsedAgent1.success) {
    return {
      ok: false,
      reason: {
        code: "agent1_output_invalid",
        message: "Agent 1 output does not match required contract.",
        details: formatIssues(parsedAgent1.error.issues),
      },
    };
  }

  const candidateAgent2Input = {
    input: parsedAgent1.data.input,
    job_identity: parsedAgent1.data.job_identity,
    derived: {
      company_research_brief: parsedAgent1.data.handoff_to_agent_2?.company_research_brief,
      mission_statement: parsedAgent1.data.mission?.one_sentence,
    },
  };

  const parsedAgent2Input = Agent2InputSchema.safeParse(candidateAgent2Input);
  if (!parsedAgent2Input.success) {
    return {
      ok: false,
      reason: {
        code: "agent2_input_invalid",
        message: "Agent 2 input extraction failed schema validation.",
        details: formatIssues(parsedAgent2Input.error.issues),
      },
    };
  }

  return { ok: true, data: parsedAgent2Input.data };
}
