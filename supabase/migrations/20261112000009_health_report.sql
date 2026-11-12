-- Week 6: a health report for the daily maintenance job.
--
-- The 5-minute check job was deleted once on day one without anyone noticing
-- for a while. health_report() lets the daily job see whether checks really
-- ran: is the cron job present and active, how many runs in the last 24 h,
-- and the longest gap between runs. Server-only (reads the cron schema).

create function public.health_report()
returns table (
  job_active boolean,
  last_check_at timestamptz,
  runs_24h integer,
  max_gap_minutes integer,
  gaps_over_15m integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with runs as (
    -- one row per checker run (all checks in a run share checked_at)
    select distinct c.checked_at
    from public.checks c
    where c.checked_at > now() - interval '24 hours'
  ),
  gaps as (
    select extract(epoch from (checked_at - lag(checked_at) over (order by checked_at))) / 60 as minutes
    from runs
  )
  select
    exists (select 1 from cron.job j where j.jobname = 'check-monitors' and j.active),
    (select max(c.checked_at) from public.checks c),
    (select count(*)::integer from runs),
    coalesce((select ceil(max(minutes))::integer from gaps), 0),
    (select count(*)::integer from gaps where minutes > 15);
$$;

revoke execute on function public.health_report() from public, anon, authenticated;
grant execute on function public.health_report() to service_role;
