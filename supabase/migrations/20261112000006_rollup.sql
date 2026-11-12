-- Week 5: hourly summaries (kept forever) and 30-day cleanup of raw checks.
-- Raw checks: ~4,300 rows/day for 15 sites. Summaries: 24 rows/site/day.
-- Together this keeps the database small (Supabase free tier) while the
-- best-time heatmap gets months of history.

-- ---------------------------------------------------------------------------
-- rollup_hourly_stats(): summarize raw checks into hourly_stats for every
-- finished hour since p_since. Recomputes those hours from scratch (upsert),
-- so running it twice, late, or overlapping never double-counts.
-- Hours are UTC; Manila is UTC+8, so UTC hours line up with Manila hours.
-- ---------------------------------------------------------------------------

create function public.rollup_hourly_stats(p_since timestamptz default now() - interval '48 hours')
returns integer
language sql
security invoker
set search_path = ''
as $$
  with agg as (
    select
      c.monitor_id,
      date_trunc('hour', c.checked_at, 'UTC') as hour,
      count(*)::integer as total,
      count(*) filter (where c.status = 'up')::integer as up_count,
      count(*) filter (where c.status = 'slow')::integer as slow_count,
      count(*) filter (where c.status = 'down')::integer as down_count,
      round(avg(c.response_time_ms))::integer as avg_response_ms
    from public.checks c
    where c.checked_at >= date_trunc('hour', p_since, 'UTC')
      and c.checked_at < date_trunc('hour', now(), 'UTC')   -- finished hours only
    group by 1, 2
  ),
  upserted as (
    insert into public.hourly_stats as h
      (monitor_id, hour, total, up_count, slow_count, down_count, avg_response_ms)
    select * from agg
    on conflict (monitor_id, hour) do update set
      total = excluded.total,
      up_count = excluded.up_count,
      slow_count = excluded.slow_count,
      down_count = excluded.down_count,
      avg_response_ms = excluded.avg_response_ms
    returning 1
  )
  select count(*)::integer from upserted;
$$;

-- ---------------------------------------------------------------------------
-- cleanup_old_checks(): delete raw checks older than 30 days, but only rows
-- whose hour has been summarized (so nothing is lost if the rollup ever fell
-- behind). Returns the number of rows deleted.
-- ---------------------------------------------------------------------------

create function public.cleanup_old_checks()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with deleted as (
    delete from public.checks c
    where c.checked_at < now() - interval '30 days'
      and exists (
        select 1 from public.hourly_stats h
        where h.monitor_id = c.monitor_id
          and h.hour = date_trunc('hour', c.checked_at, 'UTC')
      )
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.rollup_hourly_stats(timestamptz) from public, anon, authenticated;
revoke execute on function public.cleanup_old_checks() from public, anon, authenticated;
grant execute on function public.rollup_hourly_stats(timestamptz) to service_role;
grant execute on function public.cleanup_old_checks() to service_role;

-- Backfill everything collected so far (data collection began 2026-11-11).
select public.rollup_hourly_stats('2026-11-01T00:00:00Z');
