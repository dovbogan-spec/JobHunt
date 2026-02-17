import { getAgentForStep, maxSteps } from "../agents";
import { createEvent, getRun, saveStep, updateRunStatus, upsertArtifacts } from "../storage/runsRepo";

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

  const result = await agent.run({
    runId,
    context: { run: snapshot.run, artifacts: snapshot.artifacts },
    inputs: {
      jd_text: snapshot.run?.jd_text,
      experience_text: snapshot.run?.experience_text,
      artifacts: snapshot.artifacts,
    },
  });

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

  await upsertArtifacts(runId, result.artifactUpdates);
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

  for (let stepIndex = 1; stepIndex <= maxSteps(); stepIndex += 1) {
    const result = await executeStep(runId, stepIndex);
    if ((result as { ok?: boolean }).ok === false) {
      return result;
    }
  }

  return { ok: true };
}
