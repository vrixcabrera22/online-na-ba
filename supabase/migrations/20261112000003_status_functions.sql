-- Week 2: functions behind the status board, plus incident tracking.
--
-- Uptime over 24 h / 7 d / 30 d needs thousands of check rows per site, more
-- than the API returns in one request (1,000), so Postgres does the math and
-- returns small results.

-- ---------------------------------------------------------------------------
-- status_board(): one row per public, active site with its latest check and
-- uptime percentages. Pass a slug to get a single site (detail page).
--
-- Uptime % = (up + slow) / all checks in the period. Null when there are no
-- checks in the period yet.
-- SECURITY INVOKER: row-level security still applies, so only public monitors
-- and their checks are visible to visitors.
-- ---------------------------------------------------------------------------

create function public.status_board(p_slug text default null)
returns table (
  id uuid,
  slug text,
  name text,
  url text,
  category text,
  sort_order integer,
  last_status public.check_status,
  last_status_code integer,
  last_response_ms integer,
  last_checked_at timestamptz,
  uptime_24h numeric,
  uptime_7d numeric,
  uptime_30d numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id, m.slug, m.name, m.url, m.category, m.sort_order,
    l.status, l.status_code, l.response_time_ms, l.checked_at,
    u.uptime_24h, u.uptime_7d, u.uptime_30d
  from public.monitors m
  left join lateral (
    select c.status, c.status_code, c.response_time_ms, c.checked_at
    from public.checks c
    where c.monitor_id = m.id
    order by c.checked_at desc
    limit 1
  ) l on true
  left join lateral (
    select
      round(100.0 * count(*) filter (where c.status <> 'down' and c.checked_at > now() - interval '24 hours')
            / nullif(count(*) filter (where c.checked_at > now() - interval '24 hours'), 0), 2) as uptime_24h,
      round(100.0 * count(*) filter (where c.status <> 'down' and c.checked_at > now() - interval '7 days')
            / nullif(count(*) filter (where c.checked_at > now() - interval '7 days'), 0), 2) as uptime_7d,
      round(100.0 * count(*) filter (where c.status <> 'down')
            / nullif(count(*), 0), 2) as uptime_30d
    from public.checks c
    where c.monitor_id = m.id
      and c.checked_at > now() - interval '30 days'
  ) u on true
  where m.is_public
    and m.is_active
    and (p_slug is null or m.slug = p_slug)
  order by m.category, m.sort_order, m.name;
$$;

-- ---------------------------------------------------------------------------
-- response_times(): points for the response-time chart.
--   '24h' → every check in the last 24 hours (≤ 288 points)
--   '7d'  → hourly buckets for the last 7 days (≤ 168 points)
-- avg_response_ms is null for buckets where every check failed.
-- Works for any monitor the caller can see (RLS), so the Week 3 dashboard can
-- reuse it for personal monitors.
-- ---------------------------------------------------------------------------

create function public.response_times(p_monitor_id uuid, p_range text default '24h')
returns table (
  bucket timestamptz,
  avg_response_ms integer,
  total integer,
  down integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when p_range = '7d' then date_trunc('hour', c.checked_at) else c.checked_at end as bucket,
    round(avg(c.response_time_ms))::integer as avg_response_ms,
    count(*)::integer as total,
    count(*) filter (where c.status = 'down')::integer as down
  from public.checks c
  where c.monitor_id = p_monitor_id
    and c.checked_at > now() - case when p_range = '7d' then interval '7 days' else interval '24 hours' end
  group by 1
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- record_checks(): save one run's results and update incidents, atomically.
--
-- Incident rules (CLAUDE.md):
--   - 2 consecutive down checks open an incident, starting at the first one
--   - the first check that isn't down closes it
-- Returns the incidents opened or closed by this run, so the caller can send
-- alerts (Week 4). Server-only: callable with the secret key, not by users.
--
-- p_checks: [{ monitor_id, status, status_code, response_time_ms, error, checked_at }]
-- ---------------------------------------------------------------------------

create function public.record_checks(p_checks jsonb)
returns table (
  event text,               -- 'opened' | 'closed'
  incident_id bigint,
  monitor_id uuid,
  started_at timestamptz,
  ended_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
-- The OUT columns (monitor_id, started_at, ...) share names with table
-- columns; inside SQL statements, names refer to the table columns.
#variable_conflict use_column
declare
  r record;
  prev_status public.check_status;
  prev_at timestamptz;
  open_id bigint;
begin
  for r in
    select *
    from jsonb_to_recordset(p_checks) as x(
      monitor_id uuid,
      status public.check_status,
      status_code integer,
      response_time_ms integer,
      error text,
      checked_at timestamptz
    )
  loop
    -- The check right before this one, for the "2 in a row" rule.
    select c.status, c.checked_at into prev_status, prev_at
    from public.checks c
    where c.monitor_id = r.monitor_id and c.checked_at < r.checked_at
    order by c.checked_at desc
    limit 1;

    insert into public.checks (monitor_id, status, status_code, response_time_ms, error, checked_at)
    values (r.monitor_id, r.status, r.status_code, r.response_time_ms, r.error, r.checked_at);

    select i.id into open_id
    from public.incidents i
    where i.monitor_id = r.monitor_id and i.ended_at is null;

    if r.status = 'down' then
      if open_id is null and prev_status = 'down' then
        -- ON CONFLICT: if two runs overlap, only one opens the incident.
        insert into public.incidents as i (monitor_id, started_at)
        values (r.monitor_id, prev_at)
        on conflict (monitor_id) where ended_at is null do nothing
        returning i.id, i.monitor_id, i.started_at, i.ended_at
        into incident_id, monitor_id, started_at, ended_at;

        if incident_id is not null then
          event := 'opened';
          return next;
        end if;
      end if;
    elsif open_id is not null then
      update public.incidents as i
      set ended_at = r.checked_at
      where i.id = open_id and i.ended_at is null
      returning i.id, i.monitor_id, i.started_at, i.ended_at
      into incident_id, monitor_id, started_at, ended_at;

      if incident_id is not null then
        event := 'closed';
        return next;
      end if;
    end if;

    incident_id := null;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions. Supabase grants EXECUTE on new functions to everyone by
-- default, so set them explicitly.
-- ---------------------------------------------------------------------------

revoke execute on function public.status_board(text) from public;
revoke execute on function public.response_times(uuid, text) from public;
grant execute on function public.status_board(text) to anon, authenticated;
grant execute on function public.response_times(uuid, text) to anon, authenticated;

revoke execute on function public.record_checks(jsonb) from public, anon, authenticated;
grant execute on function public.record_checks(jsonb) to service_role;
