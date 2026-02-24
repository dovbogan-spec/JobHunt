create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'local',
  title text not null,
  status text not null check (status in ('created','running','succeeded','failed','cancelled')),
  candidate_name text,
  jd_source_type text not null check (jd_source_type in ('paste','url')),
  jd_source_url text,
  jd_text text not null,
  experience_file_id text,
  experience_file_url text,
  experience_file_pathname text,
  experience_text text,
  selected_template text not null default 'modern_1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  step_index int not null,
  agent_name text not null,
  status text not null check (status in ('queued','running','succeeded','failed')),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (run_id, step_index)
);

alter table run_steps add column if not exists agent_id text;
alter table run_steps add column if not exists schema_version int not null default 1;
alter table run_steps add column if not exists retry_count int not null default 0;
alter table run_steps add column if not exists duration_ms bigint;
alter table run_steps add column if not exists input_schema_version int;
alter table run_steps add column if not exists output_schema_version int;
alter table run_steps add column if not exists error_json jsonb;
alter table run_steps add column if not exists output_pointer text;
alter table run_steps add column if not exists artifacts_json jsonb not null default '[]'::jsonb;

update run_steps
set agent_id = coalesce(agent_id, agent_name),
    input_schema_version = coalesce(input_schema_version, schema_version),
    output_schema_version = coalesce(output_schema_version, schema_version),
    error_json = coalesce(error_json, case when error is not null then jsonb_build_object('message', error) else null end),
    duration_ms = coalesce(duration_ms, case when started_at is not null and finished_at is not null then greatest((extract(epoch from (finished_at - started_at)) * 1000)::bigint, 0) else null end)
where agent_id is null
   or input_schema_version is null
   or output_schema_version is null
   or (error is not null and error_json is null)
   or (started_at is not null and finished_at is not null and duration_ms is null);

do $$
begin
  alter table run_steps drop constraint if exists run_steps_status_check;
  alter table run_steps add constraint run_steps_status_check
    check (status in ('pending','running','succeeded','failed','skipped','queued'));
exception
  when duplicate_object then null;
end $$;

create table if not exists run_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, type)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


create table if not exists run_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  run_id uuid references runs(id) on delete set null,
  status_code int,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, idempotency_key)
);
