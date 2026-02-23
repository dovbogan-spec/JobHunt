import { createEvent, getRun, updateRunStatus } from "../storage/runsRepo.js";
import { extractAgent1ForAgent2 } from "./extractAgent1ForAgent2.js";

type StepExecutionResult = {
  ok?: boolean;
  skipped?: boolean;
  reason?: string | { code: string; message: string; details?: unknown };
  error?: string;
};

type ExecuteStep = (runId: string, stepIndex: number, force?: boolean) => Promise<StepExecutionResult>;

type SettledStepResult = PromiseSettledResult<StepExecutionResult>;

function isSuccessful(result: SettledStepResult | StepExecutionResult) {
  if ((result as SettledStepResult).status) {
    const settledResult = result as SettledStepResult;
    return settledResult.status === "fulfilled" && settledResult.value?.ok === true;
  }
  return (result as StepExecutionResult)?.ok === true;
}

function isFallbackAvailable(artifacts: Array<{ type: string }>, type: string) {
  return artifacts.some((artifact) => artifact.type === type);
}

async function canLaunchAgent2(runId: string) {
  const snapshot = await getRun(runId);
  const experienceText = typeof snapshot.run?.experience_text === "string" ? snapshot.run.experience_text.trim() : "";
  if (experienceText.length === 0) {
    return {
      ok: false as const,
      reason: {
        code: "missing_experience_text",
        message: "experience_text is required before Agent 2.",
      },
    };
  }

  const parsedJdArtifact = snapshot.artifacts.find((artifact) => artifact.type === "parsed_jd")?.data;
  const extraction = extractAgent1ForAgent2(parsedJdArtifact);
  if (!extraction.ok) {
    return {
      ok: false as const,
      reason: extraction.reason,
    };
  }

  return { ok: true as const };
}

export async function executeGenerateDag(runId: string, executeStep: ExecuteStep) {
  await updateRunStatus(runId, "running");
  await createEvent(runId, "run_started", { runId });

  const agent1Promise = executeStep(runId, 1);
  const agent3Promise = executeStep(runId, 3);
  const agent2Promise = agent1Promise.then(async (agent1Result) => {
    if (!isSuccessful(agent1Result)) {
      return {
        ok: false,
        skipped: true,
        reason: {
          code: "agent1_failed",
          message: "Agent 1 did not succeed.",
        },
      };
    }
    const launchability = await canLaunchAgent2(runId);
    if (!launchability.ok) {
      return { ok: false, skipped: true, reason: launchability.reason };
    }
    return executeStep(runId, 2);
  });

  const terminalResults = await Promise.allSettled([agent1Promise, agent2Promise, agent3Promise]);
  const [agent1Terminal, agent2Terminal, agent3Terminal] = terminalResults;

  const snapshot = await getRun(runId);
  const hasAgent2Input = isSuccessful(agent2Terminal) || isFallbackAvailable(snapshot.artifacts, "parsed_experience");
  const hasAgent3Input = isSuccessful(agent3Terminal) || isFallbackAvailable(snapshot.artifacts, "tagged_bullets");

  if (!isSuccessful(agent1Terminal) || !hasAgent2Input || !hasAgent3Input) {
    const reason = "Minimum required data unavailable for Agent 4.";
    await createEvent(runId, "run_failed", {
      reason,
      nodes: {
        agent_1_job_normalizer: isSuccessful(agent1Terminal),
        agent_2_job_analysis: hasAgent2Input,
        agent_3_profile_parser: hasAgent3Input,
      },
    });
    await updateRunStatus(runId, "failed");
    return { ok: false, error: reason };
  }

  const agent4Result = await executeStep(runId, 4);
  if (agent4Result.ok === false) {
    return agent4Result;
  }

  await updateRunStatus(runId, "succeeded");
  await createEvent(runId, "run_completed", { runId });
  return { ok: true };
}
