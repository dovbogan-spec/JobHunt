import { getConfig } from "../config/edgeConfig";
import { getAgentForStep, maxSteps } from "../agents";
import { createEvent, getRun, saveStep, updateRunStatus, upsertArtifacts } from "../storage/runsRepo";
import { getAgentForStep, maxSteps } from "../agents/index.js";
import { createEvent, getRun, saveStep, updateRunStatus, upsertArtifacts } from "../storage/runsRepo.js";
import { agentResultSchema } from "../../shared/schemas/api.js";

export async function executeStep(runId: string, stepIndex: number, force = false) {
  const agent = getAgentForStep(stepIndex);
  if (!agent) {
    throw new Error(`Unknown step index ${stepIndex}`);
  }

  const snapshot = await getRun(runId);
  const existing = snapshot.steps.find((step: { step_index: number; status: string }) => step.step_index === stepIndex);

  if (!force && existing?.status === "succeeded") {
    return { skipped: true, reason: "Step already succeeded" };
  }

  await createEvent(runId, "step_started", { stepIndex, agent: agent.name });
  await saveStep({
    runId,
    stepIndex,
    agentName: agent.name,
    status: "running",
    inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
  });

  const rawResult = await agent.run({
    runId,
    context: { run: snapshot.run, artifacts: snapshot.artifacts },
    inputs: {
      jd_text: snapshot.run?.jd_text,
      experience_text: snapshot.run?.experience_text,
      artifacts: snapshot.artifacts,
    },
  });

  const parsedResult = agentResultSchema.safeParse(rawResult);
  if (!parsedResult.success) {
    const schemaError = parsedResult.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    await saveStep({
      runId,
      stepIndex,
      agentName: agent.name,
      status: "failed",
      inputJson: {},
      outputJson: rawResult,
      error: `Agent output schema mismatch: ${schemaError}`,
    });
    await updateRunStatus(runId, "failed");
    return { ok: false, error: `Agent output schema mismatch: ${schemaError}` };
  }
  const result = parsedResult.data;

  if (!result.ok) {
    const errorText = result.errors.join("; ") || "Agent failed";
    await saveStep({
      runId,
      stepIndex,
      agentName: agent.name,
      status: "failed",
      inputJson: {},
      outputJson: result,
      error: errorText,
    });
    await updateRunStatus(runId, "failed");
    await createEvent(runId, "run_failed", { stepIndex, error: errorText });
    return { ok: false };
  }

  await upsertArtifacts(
    runId,
    result.artifactUpdates.map((artifact) => ({ type: artifact.type, data: artifact.data })),
  );
  await saveStep({
    runId,
    stepIndex,
    agentName: agent.name,
    status: "succeeded",
    inputJson: {},
    outputJson: result,
  });
  await createEvent(runId, "step_completed", { stepIndex, agent: agent.name });

  if (stepIndex >= maxSteps()) {
    await updateRunStatus(runId, "succeeded");
    await createEvent(runId, "run_completed", { runId });
    return { ok: true, finished: true };
  }

  return { ok: true, finished: false, nextStep: stepIndex + 1 };
}

export async function startRun(runId: string) {
  await updateRunStatus(runId, "running");
  await createEvent(runId, "run_started", { runId });

  const config = await getConfig();
  if (!config.featureFlags.enableCompanyInsights) {
    await createEvent(runId, "company_insights_skipped", { reason: "Disabled by feature flag" });
  }

  for (let stepIndex = 1; stepIndex <= maxSteps(); stepIndex += 1) {
    const result = await executeStep(runId, stepIndex);
    if ((result as { ok?: boolean }).ok === false) {
      return result;
    }
  }

  return { ok: true };
}
