-- Online Na Ba? — initial schema
-- Six tables: profiles, monitors, checks, hourly_stats, incidents, alert_settings.
-- Row-level security is on for every table. Only the server (service role key,
-- which bypasses RLS) writes checks, hourly_stats and incidents.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.check_status as enum ('up', 'slow', 'down');
create type public.plan_type as enum ('free', 'pro');

-- ---------------------------------------------------------------------------
-- profiles: one row per user, created automatically on sign-up
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan_type not null default 'free',
  preferred_locale text not null default 'fil' check (preferred_locale in ('fil', 'en')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- monitors: every site being checked.
-- Public monitors (the government sites) have no owner; personal monitors do.
-- ---------------------------------------------------------------------------

create table public.monitors (
  id uuid primary key default gen_random_uuid(),
  -- URL-friendly id for public sites: /status/[slug]. Null for personal monitors.
  slug text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 100),
  url text not null check (url ~* '^https?://' and char_length(url) <= 2048),
  -- Translated in the UI via the messages files.
  category text check (category in ('benefits', 'ids', 'tax', 'others')),
  is_public boolean not null default false,
  owner_id uuid references public.profiles (id) on delete cascade default auth.uid(),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A monitor is either public, or owned by someone.
  constraint monitors_public_or_owned check (is_public or owner_id is not null)
);

create index monitors_owner_id_idx on public.monitors (owner_id);
create index monitors_active_idx on public.monitors (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- checks: one row per check. Raw rows are kept 30 days (cleanup job, Week 5).
-- ---------------------------------------------------------------------------

create table public.checks (
  id bigint generated always as identity primary key,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  status public.check_status not null,
  status_code integer,                -- null when there was no response
  response_time_ms integer,           -- null on timeout / network error
  error text,                         -- short reason when down
  checked_at timestamptz not null default now()
);

create index checks_monitor_checked_at_idx on public.checks (monitor_id, checked_at desc);
create index checks_checked_at_idx on public.checks (checked_at);

-- ---------------------------------------------------------------------------
-- hourly_stats: checks rolled up per monitor per hour. Kept forever.
-- ---------------------------------------------------------------------------

create table public.hourly_stats (
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  hour timestamptz not null,          -- start of the hour, UTC
  total integer not null default 0,
  up_count integer not null default 0,
  slow_count integer not null default 0,
  down_count integer not null default 0,
  avg_response_ms integer,
  primary key (monitor_id, hour)
);

-- ---------------------------------------------------------------------------
-- incidents: consecutive down periods. Open while ended_at is null.
-- ---------------------------------------------------------------------------

create table public.incidents (
  id bigint generated always as identity primary key,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer generated always as (
    extract(epoch from (ended_at - started_at))::integer
  ) stored,
  constraint incidents_end_after_start check (ended_at is null or ended_at >= started_at)
);

create index incidents_monitor_started_idx on public.incidents (monitor_id, started_at desc);
-- At most one open incident per monitor.
create unique index incidents_one_open_per_monitor on public.incidents (monitor_id)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- alert_settings: who gets emailed about which monitor
-- ---------------------------------------------------------------------------

create table public.alert_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, monitor_id)
);

create index alert_settings_monitor_idx on public.alert_settings (monitor_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create a profile when someone signs up. The sign-up form can pass the
-- current UI language as user metadata { locale: 'fil' | 'en' }.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, preferred_locale)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'fil' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enforce the personal monitor limit in the database, not just the UI.
-- Free: 3. Pro (v2): 20.
create function public.enforce_monitor_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_plan public.plan_type;
  current_count integer;
  max_allowed integer;
begin
  if new.owner_id is null then
    return new;
  end if;

  -- Lock the owner's profile row so two inserts at the same time can't both
  -- slip under the limit.
  select plan into owner_plan
  from public.profiles
  where id = new.owner_id
  for update;

  max_allowed := case owner_plan when 'pro' then 20 else 3 end;

  select count(*) into current_count
  from public.monitors
  where owner_id = new.owner_id;

  if current_count >= max_allowed then
    raise exception 'monitor_limit_reached'
      using errcode = 'P0001',
            hint = format('Plan allows %s monitors.', max_allowed);
  end if;

  return new;
end;
$$;

create trigger monitors_enforce_limit
  before insert on public.monitors
  for each row execute function public.enforce_monitor_limit();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger monitors_set_updated_at
  before update on public.monitors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.monitors enable row level security;
alter table public.checks enable row level security;
alter table public.hourly_stats enable row level security;
alter table public.incidents enable row level security;
alter table public.alert_settings enable row level security;

-- profiles: users see and edit only their own row.
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- monitors: anyone reads public monitors; users manage only their own,
-- and can never make one public (that's reserved for the server).
create policy "Anyone reads public monitors" on public.monitors
  for select to anon, authenticated
  using (is_public);

create policy "Users read own monitors" on public.monitors
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Users create own monitors" on public.monitors
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and not is_public);

create policy "Users update own monitors" on public.monitors
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not is_public);

create policy "Users delete own monitors" on public.monitors
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- checks, hourly_stats, incidents: readable when the monitor is readable.
-- No insert/update/delete policies: only the service role writes these.
create policy "Read checks of visible monitors" on public.checks
  for select to anon, authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = checks.monitor_id
      and (m.is_public or m.owner_id = (select auth.uid()))
  ));

create policy "Read stats of visible monitors" on public.hourly_stats
  for select to anon, authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = hourly_stats.monitor_id
      and (m.is_public or m.owner_id = (select auth.uid()))
  ));

create policy "Read incidents of visible monitors" on public.incidents
  for select to anon, authenticated
  using (exists (
    select 1 from public.monitors m
    where m.id = incidents.monitor_id
      and (m.is_public or m.owner_id = (select auth.uid()))
  ));

-- alert_settings: users manage only their own, and only for monitors they own.
create policy "Users read own alert settings" on public.alert_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users create own alert settings" on public.alert_settings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.monitors m
      where m.id = alert_settings.monitor_id and m.owner_id = (select auth.uid())
    )
  );

create policy "Users update own alert settings" on public.alert_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.monitors m
      where m.id = alert_settings.monitor_id and m.owner_id = (select auth.uid())
    )
  );

create policy "Users delete own alert settings" on public.alert_settings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Column privileges (defense in depth on top of RLS)
-- Supabase grants full table access to anon/authenticated by default; RLS then
-- filters rows. Here we also limit which columns users may write, so nobody can
-- upgrade their own plan or set a slug/category/sort order.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (preferred_locale) on public.profiles to authenticated;

revoke insert, update, delete on public.monitors from anon, authenticated;
grant insert (name, url, is_active, owner_id) on public.monitors to authenticated;
grant update (name, url, is_active) on public.monitors to authenticated;
grant delete on public.monitors to authenticated;

revoke insert, update, delete on public.checks from anon, authenticated;
revoke insert, update, delete on public.hourly_stats from anon, authenticated;
revoke insert, update, delete on public.incidents from anon, authenticated;

revoke insert, update, delete on public.alert_settings from anon;
revoke update on public.alert_settings from authenticated;
grant update (email, enabled) on public.alert_settings to authenticated;
