import { createHash } from "node:crypto";
import { getAgentForStep, maxSteps } from "../agents/index.js";
import { createEvent, getRun, saveStep, updateRunStatus, upsertArtifacts } from "../storage/runsRepo.js";
import { agentResultSchema } from "../../shared/schemas/api.js";

const locks = new Set<string>();
export const hashStepInputs = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function missingRequiredInputs(stepIndex: number, run: Record<string, unknown> | null) {
  const jdText = typeof run?.jd_text === "string" ? run.jd_text.trim() : "";
  const experienceText = typeof run?.experience_text === "string" ? run.experience_text.trim() : "";
  if (stepIndex === 1 && !jdText) return "jd_text is required.";
  if ((stepIndex === 2 || stepIndex === 3) && !experienceText) return "experience_text is required.";
  return null;
}

export async function executeStep(runId: string, stepIndex: number, force = false) {
  const lockKey = `${runId}:${stepIndex}`;
  if (locks.has(lockKey)) return { skipped: true, reason: "Step already running" };
  locks.add(lockKey);
  try {
    const agent = getAgentForStep(stepIndex);
    if (!agent) throw new Error(`Unknown step index ${stepIndex}`);
    const snapshot = await getRun(runId);
    const existing = snapshot.steps.find((s: any) => s.step_index === stepIndex);
    const inputHash = hashStepInputs({ run: snapshot.run, artifacts: snapshot.artifacts, stepIndex });

    if (!force && existing?.status === "succeeded" && existing.output_json?.meta?.inputHash === inputHash) {
      return { skipped: true, reason: "Step already succeeded with identical inputs" };
    }

    const requiredInputError = missingRequiredInputs(stepIndex, snapshot.run as Record<string, unknown> | null);
    if (requiredInputError) {
      await saveStep({ runId, stepIndex, agentName: agent.name, status: "failed", inputJson: { inputHash }, outputJson: {}, error: requiredInputError });
      await updateRunStatus(runId, "failed");
      return { ok: false, error: requiredInputError };
    }

    await saveStep({ runId, stepIndex, agentName: agent.name, status: "running", inputJson: { inputHash } });
    await createEvent(runId, "step_started", { stepIndex, agent: agent.name });
    const rawResult = await agent.run({ runId, context: { run: snapshot.run, artifacts: snapshot.artifacts as any }, inputs: { jd_text: snapshot.run?.jd_text, experience_text: snapshot.run?.experience_text, artifacts: snapshot.artifacts } });
    const parsed = agentResultSchema.safeParse(rawResult);
    if (!parsed.success || !parsed.data.ok) {
      const errorText = parsed.success ? parsed.data.errors.join("; ") : parsed.error.message;
      await saveStep({ runId, stepIndex, agentName: agent.name, status: "failed", inputJson: { inputHash }, outputJson: rawResult, error: errorText });
      await updateRunStatus(runId, "failed");
      return { ok: false, error: errorText };
    }

    const result = parsed.data;
    const withMeta = { ...result, meta: { ...(result.meta || {}), inputHash } };
    await upsertArtifacts(runId, result.artifactUpdates.map((a) => ({ type: a.type, data: a.data })));
    await saveStep({ runId, stepIndex, agentName: agent.name, status: "succeeded", inputJson: { inputHash }, outputJson: withMeta });
    await createEvent(runId, "step_completed", { stepIndex, agent: agent.name });

    if (stepIndex >= maxSteps()) {
      await updateRunStatus(runId, "succeeded");
      return { ok: true, finished: true };
    }
    return { ok: true, finished: false, nextStep: stepIndex + 1 };
  } finally {
    locks.delete(lockKey);
  }
}

export async function startRun(runId: string) {
  await updateRunStatus(runId, "running");
  for (let stepIndex = 1; stepIndex <= maxSteps(); stepIndex += 1) {
    const result = await executeStep(runId, stepIndex);
    if ((result as any).ok === false) return result;
  }
  return { ok: true };
}
