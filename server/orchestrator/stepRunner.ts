import { getConfig } from "../config/edgeConfig.js";
import { executeGenerateDag } from "./generateDag.js";
import { getAgentForStep, maxSteps } from "../agents/index.js";
import { createEvent, getRun, saveStep, updateRunStatus, upsertArtifacts } from "../storage/runsRepo.js";
import { agentResultSchema } from "../../shared/schemas/api.js";
import { withRetry } from "./retry.js";

const RETRY_DEFAULTS = {
  maxAttempts: Number(process.env.ORCHESTRATOR_RETRY_MAX_ATTEMPTS || 3),
  maxElapsedMs: Number(process.env.ORCHESTRATOR_RETRY_MAX_ELAPSED_MS || 30_000),
  baseDelayMs: Number(process.env.ORCHESTRATOR_RETRY_BASE_DELAY_MS || 300),
};

const QUALITY_GATE_MIN_CONFIDENCE = Number(process.env.ORCHESTRATOR_QUALITY_MIN_CONFIDENCE || 0.7);

function shouldRunQualityEvaluator(stepIndex: number) {
  const enabled = ["1", "true", "yes", "on"].includes(
    (process.env.FEATURE_ENABLE_PROD_QUALITY_EVALUATOR || "").toLowerCase(),
  );
  return process.env.NODE_ENV === "production" && enabled && [1, 4].includes(stepIndex);
}

function flattenSchemaIssues(error: { issues: Array<{ path: (string | number)[]; message: string }> }) {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
}

function buildStructuredFailure(
  code: string,
  details: Record<string, unknown>,
  fallbackMessage: string,
): { code: string; message: string; details: Record<string, unknown> } {
  return {
    code,
    message: fallbackMessage,
    details,
  };
}

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

  const executionContext = {
    runId,
    context: { run: snapshot.run, artifacts: snapshot.artifacts },
    inputs: {
      jd_text: snapshot.run?.jd_text,
      experience_text: snapshot.run?.experience_text,
      artifacts: snapshot.artifacts,
    },
  };

  const rawResult = await withRetry(
    () =>
      agent.run(executionContext),
    {
      ...RETRY_DEFAULTS,
      onRetry: ({ attempt, delayMs, error }) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "orchestrator_retry",
            runId,
            stepIndex,
            attempt,
            delayMs,
            message,
          }),
        );
      },
    },
  );

  const parsedResult = agentResultSchema.safeParse(rawResult);
  if (!parsedResult.success) {
    const issues = flattenSchemaIssues(parsedResult.error);
    const hardFailure = buildStructuredFailure(
      "OUTPUT_SCHEMA_MISMATCH",
      { stage: "base_result", issues },
      `Agent output schema mismatch: ${issues.join("; ")}`,
    );
    await saveStep({
      runId,
      stepIndex,
      agentId: agent.name,
      status: "failed",
      inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
      outputJson: rawResult,
      error: hardFailure,
      artifactsJson: snapshot.artifacts,
    });
    await updateRunStatus(runId, "failed");
    await createEvent(runId, "validation_gate_failed", { stepIndex, gate: "stage_1", error: hardFailure });
    return { ok: false, error: hardFailure.message };
  }
  let result = parsedResult.data;

  const primaryArtifact = result.artifactUpdates.find((artifact) => artifact.type === agent.artifactType);
  let validationAttemptedRepair = false;
  let stage1Event: Record<string, unknown> = {
    stepIndex,
    gate: "stage_1",
    targetSchema: `${agent.name}.outputSchema`,
    initialValid: false,
    repaired: false,
    finalValid: false,
  };

  const initialAgentSpecificValidation = agent.outputSchema.safeParse(primaryArtifact?.data);
  if (initialAgentSpecificValidation.success) {
    stage1Event = { ...stage1Event, initialValid: true, finalValid: true };
  } else {
    validationAttemptedRepair = true;
    const repairRaw = await agent.repair(executionContext, {
      strictJsonOnly: true,
      schemaName: `${agent.name}.outputSchema`,
    });
    const repairParsed = agentResultSchema.safeParse(repairRaw);
    if (repairParsed.success) {
      const repairedArtifact = repairParsed.data.artifactUpdates.find((artifact) => artifact.type === agent.artifactType);
      const repairedValidation = agent.outputSchema.safeParse(repairedArtifact?.data);
      if (repairedValidation.success) {
        result = repairParsed.data;
        stage1Event = { ...stage1Event, repaired: true, finalValid: true };
      } else {
        const issues = flattenSchemaIssues(repairedValidation.error);
        const hardFailure = buildStructuredFailure(
          "AGENT_OUTPUT_INVALID_AFTER_REPAIR",
          {
            stage: "agent_specific",
            issues,
            repairAttempted: true,
            targetSchema: `${agent.name}.outputSchema`,
          },
          "Agent output failed schema validation after repair",
        );
        await saveStep({
          runId,
          stepIndex,
          agentId: agent.name,
          status: "failed",
          inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
          outputJson: repairRaw,
          error: hardFailure,
          artifactsJson: snapshot.artifacts,
        });
        await updateRunStatus(runId, "failed");
        await createEvent(runId, "validation_gate_failed", {
          stepIndex,
          gate: "stage_1",
          attemptedRepair: true,
          error: hardFailure,
        });
        return { ok: false, error: hardFailure.message };
      }
    } else {
      const issues = flattenSchemaIssues(repairParsed.error);
      const hardFailure = buildStructuredFailure(
        "REPAIR_RESULT_SCHEMA_MISMATCH",
        {
          stage: "base_result_after_repair",
          issues,
          repairAttempted: true,
        },
        "Repair response did not match orchestrator schema",
      );
      await saveStep({
        runId,
        stepIndex,
        agentId: agent.name,
        status: "failed",
        inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
        outputJson: repairRaw,
        error: hardFailure,
        artifactsJson: snapshot.artifacts,
      });
      await updateRunStatus(runId, "failed");
      await createEvent(runId, "validation_gate_failed", {
        stepIndex,
        gate: "stage_1",
        attemptedRepair: true,
        error: hardFailure,
      });
      return { ok: false, error: hardFailure.message };
    }
  }

  await createEvent(runId, "validation_gate_passed", {
    ...stage1Event,
    attemptedRepair: validationAttemptedRepair,
  });

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

  const gateEvents: Array<Record<string, unknown>> = [
    {
      gate: "stage_1",
      attemptedRepair: validationAttemptedRepair,
      finalStatus: "passed",
    },
  ];

  if (shouldRunQualityEvaluator(stepIndex) && agent.evaluate) {
    const evaluation = await agent.evaluate(executionContext, result);
    const qualityEvent: Record<string, unknown> = {
      stepIndex,
      gate: "stage_2",
      confidence: evaluation.confidence,
      threshold: QUALITY_GATE_MIN_CONFIDENCE,
      revisionRequested: false,
      status: "passed",
      notes: evaluation.notes,
    };
    if (evaluation.confidence < QUALITY_GATE_MIN_CONFIDENCE) {
      const revisionRaw = await agent.repair(executionContext, {
        strictJsonOnly: true,
        schemaName: `${agent.name}.outputSchema`,
      });
      const revisionParsed = agentResultSchema.safeParse(revisionRaw);
      if (revisionParsed.success) {
        const revisedArtifact = revisionParsed.data.artifactUpdates.find((artifact) => artifact.type === agent.artifactType);
        const revisedValidation = agent.outputSchema.safeParse(revisedArtifact?.data);
        if (revisedValidation.success) {
          result = revisionParsed.data;
          qualityEvent.revisionRequested = true;
          qualityEvent.status = "revised";
        } else {
          qualityEvent.revisionRequested = true;
          qualityEvent.status = "revision_invalid";
          qualityEvent.issues = flattenSchemaIssues(revisedValidation.error);
        }
      } else {
        qualityEvent.revisionRequested = true;
        qualityEvent.status = "revision_schema_mismatch";
        qualityEvent.issues = flattenSchemaIssues(revisionParsed.error);
      }
    }
    gateEvents.push({
      gate: "stage_2",
      confidence: evaluation.confidence,
      threshold: QUALITY_GATE_MIN_CONFIDENCE,
      revisionRequested: qualityEvent.revisionRequested,
      finalStatus: qualityEvent.status,
    });
    await createEvent(runId, "quality_gate_evaluated", qualityEvent);
  }

  const updatedArtifacts = result.artifactUpdates.map((artifact) => ({ type: artifact.type, data: artifact.data }));
  await upsertArtifacts(runId, updatedArtifacts);
  await saveStep({
    runId,
    stepIndex,
    agentId: agent.name,
    status: "succeeded",
    inputJson: { artifacts: snapshot.artifacts, run: snapshot.run },
    outputJson: { ...result, gateOutcomes: gateEvents },
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
