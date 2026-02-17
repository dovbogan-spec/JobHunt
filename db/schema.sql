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
  skill_tag text,
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
