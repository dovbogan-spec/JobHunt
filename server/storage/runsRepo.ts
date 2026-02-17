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

export async function listRuns() { return (await getDbPool().query(`select * from runs order by created_at desc limit 50`)).rows; }

export async function getRun(runId: string) {
  const pool = getDbPool();
  const [run, steps, artifacts, chat] = await Promise.all([
    pool.query(`select * from runs where id = $1`, [runId]),
    pool.query(`select * from run_steps where run_id = $1 order by step_index asc`, [runId]),
    pool.query(`select type, data, updated_at from run_artifacts where run_id = $1`, [runId]),
    pool.query(`select role, content, created_at from chat_messages where run_id = $1 order by created_at asc`, [runId]),
  ]);
  return { run: run.rows[0] || null, steps: steps.rows, artifacts: artifacts.rows, chat: chat.rows };
}

export async function saveStep(params: { runId: string; stepIndex: number; agentName: string; status: string; inputJson: unknown; outputJson?: unknown; error?: string; }) {
  await getDbPool().query(
    `insert into run_steps (run_id, step_index, agent_name, status, input_json, output_json, error, started_at, finished_at)
     values ($1,$2,$3,$4,$5,$6,$7,now(),case when $4 in ('succeeded','failed') then now() else null end)
     on conflict (run_id, step_index)
     do update set status=$4, input_json=$5, output_json=$6, error=$7, finished_at=case when $4 in ('succeeded','failed') then now() else null end`,
    [params.runId, params.stepIndex, params.agentName, params.status, JSON.stringify(params.inputJson ?? {}), JSON.stringify(params.outputJson ?? {}), params.error ?? null],
  );
}

export async function upsertArtifacts(runId: string, artifacts: Array<{ type: string; data: unknown }>) {
  const pool = getDbPool();
  await Promise.all(artifacts.map((a) => pool.query(`insert into run_artifacts (run_id, type, data) values ($1,$2,$3) on conflict (run_id, type) do update set data=$3, updated_at=now()`, [runId, a.type, JSON.stringify(a.data ?? {})])));
}

export async function createEvent(runId: string, type: string, payload: unknown) {
  await getDbPool().query(`insert into events (run_id, type, payload_json) values ($1,$2,$3)`, [runId, type, JSON.stringify(payload ?? {})]);
}

export async function listEvents(runId: string) { return (await getDbPool().query(`select id, type, payload_json, created_at from events where run_id = $1 order by created_at asc`, [runId])).rows; }
export async function updateRunStatus(runId: string, status: string) { await getDbPool().query(`update runs set status=$2, updated_at=now() where id=$1`, [runId, status]); }

export async function appendChat(runId: string, role: "user" | "assistant" | "system", content: string) {
  await getDbPool().query(`insert into chat_messages (run_id, role, content) values ($1,$2,$3)`, [runId, role, content]);
}

export async function saveExperienceUpload(params: { runId: string; fileUrl: string; filePathname: string; experienceText: string; }) {
  await getDbPool().query(`update runs set experience_file_url=$2, experience_file_pathname=$3, experience_text=$4, updated_at=now() where id=$1`, [params.runId, params.fileUrl, params.filePathname, params.experienceText]);
}
