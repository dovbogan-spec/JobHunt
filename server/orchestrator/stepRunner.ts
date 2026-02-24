import { getConfig } from "../config/edgeConfig.js";
import { executeGenerateDag } from "./generateDag.js";
import { getAgentForStep, maxSteps } from "../agents/index.js";
import { createEvent, getRun, saveStep, updateRunStatus, upsertArtifacts } from "../storage/runsRepo.js";
import { agentResultSchema } from "../../shared/schemas/api.js";

function missingRequiredInputs(stepIndex: number, run: Record<string, unknown> | null) {
  const jdText = typeof run?.jd_text === "string" ? run.jd_text.trim() : "";
  const experienceText = typeof run?.experience_text === "string" ? run.experience_text.trim() : "";

  if (stepIndex === 1 && !jdText) return "jd_text is required before running the orchestrator.";
  if (stepIndex >= 2 && !experienceText) return "experience_text is required before running step 2+.";
  return null;
}

export async function executeStep(runId: string, stepIndex: number, force = false) {
  const agent = getAgentForStep(stepIndex);
  if (!agent) {
    throw new Error(`Unknown step index ${stepIndex}`);
  }

  const snapshot = await getRun(runId);
  const existing = snapshot.steps.find((step: { step_index: number; status: string }) => step.step_index === stepIndex);

  if (!force && existing?.status === "succeeded") {
    await saveStep({
      runId,
      stepIndex,
      agentId: agent.name,
      status: "running",
      inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
      artifactsJson: snapshot.artifacts,
    });
    await saveStep({
      runId,
      stepIndex,
      agentId: agent.name,
      status: "skipped",
      inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
      outputJson: { skipped: true, reason: "Step already succeeded" },
      artifactsJson: snapshot.artifacts,
    });
    return { skipped: true, reason: "Step already succeeded" };
  }

  await createEvent(runId, "step_started", { stepIndex, agent: agent.name });
  await saveStep({
    runId,
    stepIndex,
    agentId: agent.name,
    status: "running",
    inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
    artifactsJson: snapshot.artifacts,
  });

  const requiredInputError = missingRequiredInputs(stepIndex, snapshot.run as Record<string, unknown> | null);
  if (requiredInputError) {
    await saveStep({
      runId,
      stepIndex,
      agentId: agent.name,
      status: "failed",
      inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
      outputJson: {},
      error: requiredInputError,
      artifactsJson: snapshot.artifacts,
    });
    await updateRunStatus(runId, "failed");
    await createEvent(runId, "run_failed", { stepIndex, error: requiredInputError });
    return { ok: false, error: requiredInputError };
  }

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
      agentId: agent.name,
      status: "failed",
      inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
      outputJson: rawResult,
      error: `Agent output schema mismatch: ${schemaError}`,
      artifactsJson: snapshot.artifacts,
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
      agentId: agent.name,
      status: "failed",
      inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
      outputJson: result,
      error: errorText,
      artifactsJson: snapshot.artifacts,
    });
    await updateRunStatus(runId, "failed");
    await createEvent(runId, "run_failed", { stepIndex, error: errorText });
    return { ok: false };
  }

  const updatedArtifacts = result.artifactUpdates.map((artifact) => ({ type: artifact.type, data: artifact.data }));
  await upsertArtifacts(runId, updatedArtifacts);
  await saveStep({
    runId,
    stepIndex,
    agentId: agent.name,
    status: "succeeded",
    inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
    outputJson: result,
    artifactsJson: updatedArtifacts,
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
  const config = await getConfig();
  if (!config.featureFlags.enableCompanyInsights) {
    await createEvent(runId, "company_insights_skipped", { reason: "Disabled by feature flag" });
  }

  return executeGenerateDag(runId, executeStep);
}
