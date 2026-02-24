import { randomUUID } from "node:crypto";
import { getDbPool } from "./db.js";

export async function createRun(input: Record<string, unknown>) {
  const pool = getDbPool();
  const id = randomUUID();
  await pool.query(
    `insert into runs (id, user_id, title, status, candidate_name, jd_source_type, jd_source_url, jd_text, selected_template)
     values ($1,$2,$3,'created',$4,$5,$6,$7,$8)`,
    [
      id,
      (input.userId as string) || "local",
      (input.title as string) || `Run ${new Date().toISOString()}`,
      (input.candidateName as string) || null,
      (input.jdSourceType as string) || "paste",
      (input.jdSourceUrl as string) || null,
      (input.jdText as string) || "",
      (input.selectedTemplate as string) || "modern_1",
    ],
  );
  return id;
}

export async function listRuns() {
  const pool = getDbPool();
  const res = await pool.query(`select * from runs order by created_at desc limit 50`);
  return res.rows;
}

export async function getRun(runId: string) {
  const pool = getDbPool();
  const [run, steps, artifacts, chat] = await Promise.all([
    pool.query(`select * from runs where id = $1`, [runId]),
    pool.query(
      `select id,
              run_id,
              step_index,
              coalesce(agent_id, agent_name) as agent_id,
              coalesce(agent_name, agent_id) as agent_name,
              status,
              coalesce(input_json, '{}'::jsonb) as input_json,
              coalesce(output_json, '{}'::jsonb) as output_json,
              error,
              error_json,
              schema_version,
              retry_count,
              started_at,
              finished_at,
              duration_ms,
              input_schema_version,
              output_schema_version,
              output_pointer,
              artifacts_json
       from run_steps
       where run_id = $1
       order by step_index asc`,
      [runId],
    ),
    pool.query(`select type, data, updated_at from run_artifacts where run_id = $1`, [runId]),
    pool.query(`select role, content, created_at from chat_messages where run_id = $1 order by created_at asc`, [runId]),
  ]);
  return {
    run: run.rows[0] || null,
    steps: steps.rows,
    artifacts: artifacts.rows,
    chat: chat.rows,
  };
}

export async function saveStep(params: {
  runId: string;
  stepIndex: number;
  agentId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  inputJson: unknown;
  outputJson?: unknown;
  error?: string | Record<string, unknown>;
  schemaVersion?: number;
  inputSchemaVersion?: number;
  outputSchemaVersion?: number;
  outputPointer?: string;
  artifactsJson?: unknown;
}) {
  const pool = getDbPool();
  const isTerminal = ["succeeded", "failed", "skipped"].includes(params.status);
  const errorJson =
    typeof params.error === "string"
      ? ({ message: params.error } as Record<string, unknown>)
      : (params.error ?? null);
  await pool.query(
    `insert into run_steps (
        run_id,
        step_index,
        agent_name,
        agent_id,
        status,
        input_json,
        output_json,
        error,
        error_json,
        schema_version,
        input_schema_version,
        output_schema_version,
        output_pointer,
        artifacts_json,
        started_at,
        finished_at,
        duration_ms,
        retry_count
      )
     values (
       $1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
       now(),
       case when $14 then now() else null end,
       case when $14 then 0 else null end,
       0
     )
     on conflict (run_id, step_index)
     do update set agent_name=$3,
                   agent_id=$3,
                   status=$4,
                   input_json=$5,
                   output_json=$6,
                   error=$7,
                   error_json=$8,
                   schema_version=$9,
                   input_schema_version=$10,
                   output_schema_version=$11,
                   output_pointer=$12,
                   artifacts_json=$13,
                   started_at=coalesce(run_steps.started_at, now()),
                   finished_at=case when $14 then now() else null end,
                   duration_ms=case when $14 then greatest((extract(epoch from (now() - coalesce(run_steps.started_at, now()))) * 1000)::bigint, 0) else null end,
                   retry_count=case when $4 = 'running' then run_steps.retry_count + 1 else run_steps.retry_count end`,
    [
      params.runId,
      params.stepIndex,
      params.agentId,
      params.status,
      JSON.stringify(params.inputJson ?? {}),
      JSON.stringify(params.outputJson ?? {}),
      typeof params.error === "string" ? params.error : (params.error?.message as string | undefined) ?? null,
      JSON.stringify(errorJson),
      params.schemaVersion ?? 1,
      params.inputSchemaVersion ?? params.schemaVersion ?? 1,
      params.outputSchemaVersion ?? params.schemaVersion ?? 1,
      params.outputPointer ?? null,
      JSON.stringify(params.artifactsJson ?? []),
      isTerminal,
    ],
  );
}

export async function upsertArtifacts(runId: string, artifacts: Array<{ type: string; data: unknown }>) {
  if (artifacts.length === 0) return;
  const pool = getDbPool();
  await Promise.all(
    artifacts.map((artifact) =>
      pool.query(
        `insert into run_artifacts (run_id, type, data)
         values ($1,$2,$3)
         on conflict (run_id, type)
         do update set data=$3, updated_at=now()`,
        [runId, artifact.type, JSON.stringify(artifact.data ?? {})],
      ),
    ),
  );
}

export async function createEvent(runId: string, type: string, payload: unknown) {
  const pool = getDbPool();
  await pool.query(`insert into events (run_id, type, payload_json) values ($1,$2,$3)`, [
    runId,
    type,
    JSON.stringify(payload ?? {}),
  ]);
}

export async function listEvents(runId: string) {
  const pool = getDbPool();
  const res = await pool.query(
    `select id, type, payload_json, created_at from events where run_id = $1 order by created_at asc`,
    [runId],
  );
  return res.rows;
}

export async function updateRunStatus(runId: string, status: string) {
  const pool = getDbPool();
  await pool.query(`update runs set status = $2, updated_at = now() where id = $1`, [runId, status]);
}

export async function appendChat(runId: string, role: "user" | "assistant" | "system", content: string) {
  const pool = getDbPool();
  await pool.query(`insert into chat_messages (run_id, role, content) values ($1,$2,$3)`, [
    runId,
    role,
    content,
  ]);
}

export async function saveExperienceUpload(params: {
  runId: string;
  fileUrl: string;
  filePathname: string;
  experienceText: string;
}) {
  const pool = getDbPool();
  await pool.query(
    `update runs
      set experience_file_url = $2,
          experience_file_pathname = $3,
          experience_text = $4,
          updated_at = now()
      where id = $1`,
    [params.runId, params.fileUrl, params.filePathname, params.experienceText],
  );
}
