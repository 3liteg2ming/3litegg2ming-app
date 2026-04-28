-- 0) Extensions (safe if already enabled)
create extension if not exists pgcrypto;

-- 1) Enums
do $$ begin
  create type public.eg_role as enum ('user','coach','admin','super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.eg_audit_action as enum (
    'CREATE','UPDATE','DELETE','UPSERT','RPC',
    'PUBLISH','UNPUBLISH','REBUILD','BULK','LOGIN_AS','OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.eg_job_status as enum ('queued','running','succeeded','failed','cancelled');
exception when duplicate_object then null; end $$;

-- 2) Profiles (ensure exists; if you already have eg_profiles, adapt names but keep columns)
create table if not exists public.eg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text,
  psn text,
  email text,
  team_id uuid null, -- coach team assignment
  role public.eg_role not null default 'user',
  is_banned boolean not null default false
);

create index if not exists eg_profiles_role_idx on public.eg_profiles(role);
create index if not exists eg_profiles_team_idx on public.eg_profiles(team_id);

-- updated_at trigger helper
create or replace function public.eg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_eg_profiles_updated_at on public.eg_profiles;
create trigger trg_eg_profiles_updated_at
before update on public.eg_profiles
for each row execute function public.eg_set_updated_at();

-- 3) Admin audit log (immutable append-only)
create table if not exists public.eg_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  actor_role public.eg_role,
  action public.eg_audit_action not null,
  entity_table text,
  entity_id text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  request_id text
);

create index if not exists eg_audit_created_idx on public.eg_audit_log(created_at desc);
create index if not exists eg_audit_entity_idx on public.eg_audit_log(entity_table, entity_id);

-- 4) Feature flags
create table if not exists public.eg_feature_flags (
  key text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  enabled boolean not null default false,
  description text,
  payload jsonb not null default '{}'::jsonb
);

drop trigger if exists trg_eg_feature_flags_updated_at on public.eg_feature_flags;
create trigger trg_eg_feature_flags_updated_at
before update on public.eg_feature_flags
for each row execute function public.eg_set_updated_at();

-- 5) Announcement bar / content blocks (simple CMS)
create table if not exists public.eg_content_blocks (
  key text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published boolean not null default false,
  title text,
  body text,
  payload jsonb not null default '{}'::jsonb
);

drop trigger if exists trg_eg_content_blocks_updated_at on public.eg_content_blocks;
create trigger trg_eg_content_blocks_updated_at
before update on public.eg_content_blocks
for each row execute function public.eg_set_updated_at();

-- 6) Admin jobs / queue (for rebuilds, OCR batch, imports, etc.)
create table if not exists public.eg_admin_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  type text not null,
  status public.eg_job_status not null default 'queued',
  progress int not null default 0 check (progress between 0 and 100),
  message text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists eg_admin_jobs_status_idx on public.eg_admin_jobs(status, created_at desc);

drop trigger if exists trg_eg_admin_jobs_updated_at on public.eg_admin_jobs;
create trigger trg_eg_admin_jobs_updated_at
before update on public.eg_admin_jobs
for each row execute function public.eg_set_updated_at();

-- 7) OCR / submissions queue (lightweight; ties to your existing submissions if any)
create table if not exists public.eg_ocr_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  fixture_id uuid,
  status public.eg_job_status not null default 'queued',
  source_images jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists eg_ocr_queue_status_idx on public.eg_ocr_queue(status, created_at desc);

drop trigger if exists trg_eg_ocr_queue_updated_at on public.eg_ocr_queue;
create trigger trg_eg_ocr_queue_updated_at
before update on public.eg_ocr_queue
for each row execute function public.eg_set_updated_at();

-- 8) Helper: is_admin()
create or replace function public.eg_is_admin()
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.eg_profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin','super_admin')
      and p.is_banned = false
  );
$$;

-- 9) Helper: require_admin() (throws)
create or replace function public.eg_require_admin()
returns void
language plpgsql
security definer
as $$
begin
  if not public.eg_is_admin() then
    raise exception 'Admin privileges required';
  end if;
end $$;

-- 10) Helper: write audit log (server side)
create or replace function public.eg_audit(
  p_action public.eg_audit_action,
  p_entity_table text,
  p_entity_id text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
declare v_role public.eg_role;
begin
  select role into v_role from public.eg_profiles where user_id = auth.uid();
  insert into public.eg_audit_log(actor_user_id, actor_role, action, entity_table, entity_id, summary, metadata)
  values (auth.uid(), v_role, p_action, p_entity_table, p_entity_id, p_summary, coalesce(p_metadata,'{}'::jsonb));
end $$;

-- 11) RLS enable
alter table public.eg_profiles enable row level security;
alter table public.eg_audit_log enable row level security;
alter table public.eg_feature_flags enable row level security;
alter table public.eg_content_blocks enable row level security;
alter table public.eg_admin_jobs enable row level security;
alter table public.eg_ocr_queue enable row level security;

-- 12) RLS policies
-- profiles: users can read their own; admins can read all; admins can update roles/team assignments
drop policy if exists "profiles_select_self" on public.eg_profiles;
create policy "profiles_select_self" on public.eg_profiles
for select using (user_id = auth.uid() or public.eg_is_admin());

drop policy if exists "profiles_update_self" on public.eg_profiles;
create policy "profiles_update_self" on public.eg_profiles
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Admin-only sensitive updates must go through RPCs; still allow admins to update any row via policy
drop policy if exists "profiles_admin_update" on public.eg_profiles;
create policy "profiles_admin_update" on public.eg_profiles
for update using (public.eg_is_admin())
with check (public.eg_is_admin());

-- audit log: admins only (read). No direct inserts from client.
drop policy if exists "audit_select_admin" on public.eg_audit_log;
create policy "audit_select_admin" on public.eg_audit_log
for select using (public.eg_is_admin());

drop policy if exists "audit_no_insert" on public.eg_audit_log;
create policy "audit_no_insert" on public.eg_audit_log
for insert with check (false);

drop policy if exists "audit_no_update" on public.eg_audit_log;
create policy "audit_no_update" on public.eg_audit_log
for update using (false);

drop policy if exists "audit_no_delete" on public.eg_audit_log;
create policy "audit_no_delete" on public.eg_audit_log
for delete using (false);

-- feature flags: public can read enabled flags; admins full control
drop policy if exists "flags_select_public_enabled" on public.eg_feature_flags;
create policy "flags_select_public_enabled" on public.eg_feature_flags
for select using (enabled = true or public.eg_is_admin());

drop policy if exists "flags_admin_write" on public.eg_feature_flags;
create policy "flags_admin_write" on public.eg_feature_flags
for all using (public.eg_is_admin()) with check (public.eg_is_admin());

-- content blocks: public can read published; admins full control
drop policy if exists "content_select_public_published" on public.eg_content_blocks;
create policy "content_select_public_published" on public.eg_content_blocks
for select using (published = true or public.eg_is_admin());

drop policy if exists "content_admin_write" on public.eg_content_blocks;
create policy "content_admin_write" on public.eg_content_blocks
for all using (public.eg_is_admin()) with check (public.eg_is_admin());

-- jobs / queues: admins only
drop policy if exists "jobs_admin_all" on public.eg_admin_jobs;
create policy "jobs_admin_all" on public.eg_admin_jobs
for all using (public.eg_is_admin()) with check (public.eg_is_admin());

drop policy if exists "ocr_admin_all" on public.eg_ocr_queue;
create policy "ocr_admin_all" on public.eg_ocr_queue
for all using (public.eg_is_admin()) with check (public.eg_is_admin());

-- 13) Admin RPCs (SECURITY DEFINER) — these are the real “control everything” tools.

-- Set a user's role + team assignment (coach/admin control)
create or replace function public.eg_admin_set_user_role_and_team(
  p_user_id uuid,
  p_role public.eg_role,
  p_team_id uuid
)
returns public.eg_profiles
language plpgsql
security definer
as $$
declare v_row public.eg_profiles;
begin
  perform public.eg_require_admin();

  update public.eg_profiles
     set role = p_role,
         team_id = p_team_id,
         updated_at = now()
   where user_id = p_user_id
   returning * into v_row;

  perform public.eg_audit('UPDATE','eg_profiles',p_user_id::text,
    'Set user role/team',
    jsonb_build_object('role',p_role,'team_id',p_team_id)
  );

  return v_row;
end $$;

-- Ban/unban user
create or replace function public.eg_admin_set_ban(p_user_id uuid, p_is_banned boolean)
returns public.eg_profiles
language plpgsql
security definer
as $$
declare v_row public.eg_profiles;
begin
  perform public.eg_require_admin();

  update public.eg_profiles
     set is_banned = p_is_banned,
         updated_at = now()
   where user_id = p_user_id
   returning * into v_row;

  perform public.eg_audit('UPDATE','eg_profiles',p_user_id::text,
    case when p_is_banned then 'Banned user' else 'Unbanned user' end,
    jsonb_build_object('is_banned',p_is_banned)
  );

  return v_row;
end $$;

-- Feature flag upsert
create or replace function public.eg_admin_upsert_flag(p_key text, p_enabled boolean, p_description text, p_payload jsonb)
returns public.eg_feature_flags
language plpgsql
security definer
as $$
declare v_row public.eg_feature_flags;
begin
  perform public.eg_require_admin();

  insert into public.eg_feature_flags(key, enabled, description, payload)
  values (p_key, p_enabled, p_description, coalesce(p_payload,'{}'::jsonb))
  on conflict (key) do update
    set enabled = excluded.enabled,
        description = excluded.description,
        payload = excluded.payload,
        updated_at = now()
  returning * into v_row;

  perform public.eg_audit('UPSERT','eg_feature_flags',p_key,
    'Upsert feature flag',
    jsonb_build_object('enabled',p_enabled)
  );

  return v_row;
end $$;

-- Content block upsert
create or replace function public.eg_admin_upsert_content(p_key text, p_published boolean, p_title text, p_body text, p_payload jsonb)
returns public.eg_content_blocks
language plpgsql
security definer
as $$
declare v_row public.eg_content_blocks;
begin
  perform public.eg_require_admin();

  insert into public.eg_content_blocks(key, published, title, body, payload)
  values (p_key, p_published, p_title, p_body, coalesce(p_payload,'{}'::jsonb))
  on conflict (key) do update
    set published = excluded.published,
        title = excluded.title,
        body = excluded.body,
        payload = excluded.payload,
        updated_at = now()
  returning * into v_row;

  perform public.eg_audit('UPSERT','eg_content_blocks',p_key,
    'Upsert content block',
    jsonb_build_object('published',p_published,'title',p_title)
  );

  return v_row;
end $$;

-- Generic "rebuild" job creator (hook into your existing refresh RPCs)
create or replace function public.eg_admin_enqueue_job(p_type text, p_input jsonb)
returns public.eg_admin_jobs
language plpgsql
security definer
as $$
declare v_row public.eg_admin_jobs;
begin
  perform public.eg_require_admin();

  insert into public.eg_admin_jobs(created_by, type, input)
  values (auth.uid(), p_type, coalesce(p_input,'{}'::jsonb))
  returning * into v_row;

  perform public.eg_audit('CREATE','eg_admin_jobs',v_row.id::text,
    'Enqueued admin job',
    jsonb_build_object('type',p_type)
  );

  return v_row;
end $$;

-- Mark job status (admin)
create or replace function public.eg_admin_set_job_status(p_job_id uuid, p_status public.eg_job_status, p_progress int, p_message text, p_output jsonb, p_error text)
returns public.eg_admin_jobs
language plpgsql
security definer
as $$
declare v_row public.eg_admin_jobs;
begin
  perform public.eg_require_admin();

  update public.eg_admin_jobs
     set status = p_status,
         progress = greatest(0, least(100, coalesce(p_progress,0))),
         message = p_message,
         output = coalesce(p_output, output),
         error = p_error,
         updated_at = now()
   where id = p_job_id
   returning * into v_row;

  perform public.eg_audit('UPDATE','eg_admin_jobs',p_job_id::text,
    'Updated job status',
    jsonb_build_object('status',p_status,'progress',p_progress)
  );

  return v_row;
end $$;

-- 14) Grants (ensure RPCs callable)
grant execute on function public.eg_admin_set_user_role_and_team(uuid, public.eg_role, uuid) to authenticated;
grant execute on function public.eg_admin_set_ban(uuid, boolean) to authenticated;
grant execute on function public.eg_admin_upsert_flag(text, boolean, text, jsonb) to authenticated;
grant execute on function public.eg_admin_upsert_content(text, boolean, text, text, jsonb) to authenticated;
grant execute on function public.eg_admin_enqueue_job(text, jsonb) to authenticated;
grant execute on function public.eg_admin_set_job_status(uuid, public.eg_job_status, int, text, jsonb, text) to authenticated;

-- 15) Additional admin RPCs for fixtures and OCR queue controls (SECURITY DEFINER)
create or replace function public.eg_admin_update_fixture(
  p_fixture_id uuid,
  p_status text default null,
  p_start_time timestamptz default null,
  p_venue text default null
)
returns public.eg_fixtures
language plpgsql
security definer
as $$
declare v_row public.eg_fixtures;
begin
  perform public.eg_require_admin();

  update public.eg_fixtures
     set status = coalesce(p_status, status),
         start_time = coalesce(p_start_time, start_time),
         venue = coalesce(p_venue, venue)
   where id = p_fixture_id
   returning * into v_row;

  perform public.eg_audit(
    'UPDATE',
    'eg_fixtures',
    p_fixture_id::text,
    'Updated fixture fields',
    jsonb_build_object('status', p_status, 'start_time', p_start_time, 'venue', p_venue)
  );

  return v_row;
end $$;

create or replace function public.eg_admin_swap_fixture_teams(
  p_fixture_id uuid
)
returns public.eg_fixtures
language plpgsql
security definer
as $$
declare
  v_row public.eg_fixtures;
  v_home uuid;
  v_away uuid;
begin
  perform public.eg_require_admin();

  select home_team_id, away_team_id into v_home, v_away
  from public.eg_fixtures
  where id = p_fixture_id;

  update public.eg_fixtures
     set home_team_id = v_away,
         away_team_id = v_home
   where id = p_fixture_id
   returning * into v_row;

  perform public.eg_audit(
    'UPDATE',
    'eg_fixtures',
    p_fixture_id::text,
    'Swapped fixture teams',
    jsonb_build_object('previous_home_team_id', v_home, 'previous_away_team_id', v_away)
  );

  return v_row;
end $$;

create or replace function public.eg_admin_clear_fixture_scores(
  p_fixture_id uuid
)
returns public.eg_fixtures
language plpgsql
security definer
as $$
declare v_row public.eg_fixtures;
begin
  perform public.eg_require_admin();

  update public.eg_fixtures
     set home_total = null,
         away_total = null,
         home_goals = null,
         home_behinds = null,
         away_goals = null,
         away_behinds = null,
         submitted_at = null,
         verified_at = null,
         disputed_at = null,
         corrected_at = null
   where id = p_fixture_id
   returning * into v_row;

  perform public.eg_audit(
    'UPDATE',
    'eg_fixtures',
    p_fixture_id::text,
    'Cleared fixture scores',
    '{}'::jsonb
  );

  return v_row;
end $$;

create or replace function public.eg_admin_set_ocr_status(
  p_queue_id uuid,
  p_status public.eg_job_status,
  p_result jsonb default null,
  p_error text default null
)
returns public.eg_ocr_queue
language plpgsql
security definer
as $$
declare v_row public.eg_ocr_queue;
begin
  perform public.eg_require_admin();

  update public.eg_ocr_queue
     set status = p_status,
         result = coalesce(p_result, result),
         error = p_error,
         updated_at = now()
   where id = p_queue_id
   returning * into v_row;

  perform public.eg_audit(
    'UPDATE',
    'eg_ocr_queue',
    p_queue_id::text,
    'Updated OCR queue status',
    jsonb_build_object('status', p_status)
  );

  return v_row;
end $$;

grant execute on function public.eg_admin_update_fixture(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.eg_admin_swap_fixture_teams(uuid) to authenticated;
grant execute on function public.eg_admin_clear_fixture_scores(uuid) to authenticated;
grant execute on function public.eg_admin_set_ocr_status(uuid, public.eg_job_status, jsonb, text) to authenticated;
