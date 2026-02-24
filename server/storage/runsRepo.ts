import { randomUUID } from "node:crypto";
import { getDbPool } from "./db.js";
import { sha256Hash } from "./hash.js";

export async function createRun(input: Record<string, unknown>) {
  const pool = getDbPool();
  const id = randomUUID();
  await pool.query(
    `insert into runs (id, user_id, title, status, candidate_name, jd_source_type, jd_source_url, jd_text, jd_text_hash, selected_template, current_step)
     values ($1,$2,$3,'created',$4,$5,$6,$7,$8,$9,0)`,
    [
      id,
      (input.userId as string) || "local",
      (input.title as string) || `Run ${new Date().toISOString()}`,
      (input.candidateName as string) || null,
      (input.jdSourceType as string) || "paste",
      (input.jdSourceUrl as string) || null,
      (input.jdText as string) || "",
      sha256Hash((input.jdText as string) || ""),
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

export async function updateRunProgress(runId: string, params: { currentStep?: number; errorSummary?: string | null }) {
  const pool = getDbPool();
  await pool.query(
    `update runs
     set current_step = coalesce($2, current_step),
         error_summary = $3,
         updated_at = now()
     where id = $1`,
    [runId, params.currentStep ?? null, params.errorSummary ?? null],
  );
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
          resume_hash = $5,
          updated_at = now()
      where id = $1`,
    [params.runId, params.fileUrl, params.filePathname, params.experienceText, sha256Hash(params.experienceText)],
  );
}

export async function upsertUserProfileSnapshot(params: {
  userId: string;
  runId: string;
  snapshotVersion: number;
  parquetBlobPath: string;
  profileHash: string;
}) {
  const pool = getDbPool();
  await pool.query(
    `insert into user_profile_snapshots (user_id, run_id, snapshot_version, parquet_blob_path, profile_hash)
     values ($1,$2,$3,$4,$5)
     on conflict (user_id, run_id, snapshot_version)
     do update set parquet_blob_path = $4,
                   profile_hash = $5,
                   updated_at = now()`,
    [params.userId, params.runId, params.snapshotVersion, params.parquetBlobPath, params.profileHash],
  );
}

type IdempotencyReservation =
  | { status: "created" }
  | { status: "replay"; statusCode: number; response: Record<string, unknown> }
  | { status: "mismatch" }
  | { status: "in_progress" };

export async function reserveIdempotencyKey(params: {
  scope: string;
  key: string;
  requestHash: string;
}): Promise<IdempotencyReservation> {
  const pool = getDbPool();

  const inserted = await pool.query(
    `insert into run_idempotency_keys (scope, idempotency_key, request_hash)
     values ($1,$2,$3)
     on conflict (scope, idempotency_key) do nothing
     returning id`,
    [params.scope, params.key, params.requestHash],
  );

  if (inserted.rowCount && inserted.rowCount > 0) {
    return { status: "created" };
  }

  const existing = await pool.query(
    `select request_hash, status_code, response_json
     from run_idempotency_keys
     where scope = $1 and idempotency_key = $2`,
    [params.scope, params.key],
  );

  const row = existing.rows[0] as
    | { request_hash: string; status_code: number | null; response_json: Record<string, unknown> }
    | undefined;
  if (!row) {
    return { status: "in_progress" };
  }

  if (row.request_hash !== params.requestHash) {
    return { status: "mismatch" };
  }

  if (typeof row.status_code === "number") {
    return {
      status: "replay",
      statusCode: row.status_code,
      response: row.response_json ?? {},
    };
  }

  return { status: "in_progress" };
}



export async function listUserRuns(userId: string) {
  const pool = getDbPool();
  const runs = await pool.query(
    `select id, user_id, title, status, candidate_name, selected_template, jd_source_type, jd_source_url, jd_text_hash, resume_hash, current_step, error_summary, created_at, updated_at
     from runs
     where user_id = $1
     order by created_at desc`,
    [userId],
  );
  return runs.rows;
}

export async function listUserRunArtifacts(userId: string) {
  const pool = getDbPool();
  const res = await pool.query(
    `select ra.run_id, ra.type, ra.data, ra.created_at, ra.updated_at
       from run_artifacts ra
       join runs r on r.id = ra.run_id
      where r.user_id = $1
      order by ra.updated_at desc`,
    [userId],
  );
  return res.rows;
}

export async function listUserSnapshots(userId: string) {
  const pool = getDbPool();
  const res = await pool.query(
    `select user_id, run_id, snapshot_version, parquet_blob_path, profile_hash, created_at, updated_at
     from user_profile_snapshots
     where user_id = $1
     order by updated_at desc`,
    [userId],
  );
  return res.rows;
}

export async function clearExpiredRawData(olderThanDays: number) {
  const pool = getDbPool();
  const res = await pool.query(
    `update runs
     set jd_text = '',
         experience_text = null,
         experience_file_url = null,
         experience_file_pathname = null,
         updated_at = now()
     where updated_at < (now() - ($1::int * interval '1 day'))
       and (coalesce(jd_text, '') <> '' or experience_text is not null or experience_file_url is not null)
     returning id, user_id`,
    [olderThanDays],
  );
  return res.rows as Array<{ id: string; user_id: string }>;
}

export async function deleteExpiredArtifacts(olderThanDays: number) {
  const pool = getDbPool();
  const res = await pool.query(
    `delete from run_artifacts
      where updated_at < (now() - ($1::int * interval '1 day'))
      returning run_id, type, data`,
    [olderThanDays],
  );
  return res.rows as Array<{ run_id: string; type: string; data: Record<string, unknown> }>;
}

export async function deleteExpiredSnapshots(olderThanDays: number) {
  const pool = getDbPool();
  const res = await pool.query(
    `delete from user_profile_snapshots
      where updated_at < (now() - ($1::int * interval '1 day'))
      returning user_id, run_id, snapshot_version, parquet_blob_path`,
    [olderThanDays],
  );
  return res.rows as Array<{ user_id: string; run_id: string; snapshot_version: number; parquet_blob_path: string }>;
}

export async function listUserBlobReferences(userId: string) {
  const pool = getDbPool();
  const [runs, artifacts, snapshots] = await Promise.all([
    pool.query(`select experience_file_url from runs where user_id = $1 and experience_file_url is not null`, [userId]),
    pool.query(
      `select ra.data
         from run_artifacts ra
         join runs r on r.id = ra.run_id
        where r.user_id = $1`,
      [userId],
    ),
    pool.query(`select parquet_blob_path from user_profile_snapshots where user_id = $1`, [userId]),
  ]);
  return {
    runArtifactIds: runs.rows.map((row) => row.experience_file_url as string),
    artifactRows: artifacts.rows as Array<{ data: Record<string, unknown> }>,
    snapshotPaths: snapshots.rows.map((row) => row.parquet_blob_path as string),
  };
}

export async function eraseUserData(userId: string) {
  const pool = getDbPool();
  const deleted = await pool.query(`delete from runs where user_id = $1 returning id`, [userId]);
  await pool.query(`delete from user_profile_snapshots where user_id = $1`, [userId]);
  return deleted.rows as Array<{ id: string }>;
}
export async function completeIdempotencyKey(params: {
  scope: string;
  key: string;
  statusCode: number;
  response: Record<string, unknown>;
  runId?: string;
}) {
  const pool = getDbPool();
  await pool.query(
    `update run_idempotency_keys
     set status_code = $3,
         response_json = $4,
         run_id = coalesce($5, run_id),
         updated_at = now()
     where scope = $1 and idempotency_key = $2`,
    [params.scope, params.key, params.statusCode, JSON.stringify(params.response), params.runId ?? null],
  );
}
