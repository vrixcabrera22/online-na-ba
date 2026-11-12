-- Week 5: data for the "best time to access" heatmap.
--
-- best_times(): per day of week × hour of day in Manila time, over the last
-- p_days days of hourly summaries: number of checks, uptime % and average
-- response time. Only cells with data are returned.
-- SECURITY INVOKER: RLS on hourly_stats applies (public sites for everyone,
-- personal monitors for their owner).

create function public.best_times(p_monitor_id uuid, p_days integer default 30)
returns table (
  dow integer,            -- 0 = Sunday … 6 = Saturday (Manila)
  hour integer,           -- 0 … 23 (Manila)
  checks integer,
  uptime numeric,         -- (up + slow) / checks, percent
  avg_response_ms integer -- weighted by responding checks; null if none responded
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    extract(dow from h.hour at time zone 'Asia/Manila')::integer as dow,
    extract(hour from h.hour at time zone 'Asia/Manila')::integer as hour,
    sum(h.total)::integer as checks,
    round(100.0 * sum(h.up_count + h.slow_count) / nullif(sum(h.total), 0), 2) as uptime,
    round(
      sum(h.avg_response_ms::numeric * (h.up_count + h.slow_count)) filter (where h.avg_response_ms is not null)
      / nullif(sum(h.up_count + h.slow_count) filter (where h.avg_response_ms is not null), 0)
    )::integer as avg_response_ms
  from public.hourly_stats h
  where h.monitor_id = p_monitor_id
    and h.hour > now() - make_interval(days => least(greatest(p_days, 1), 90))
  group by 1, 2
  order by 1, 2;
$$;

revoke execute on function public.best_times(uuid, integer) from public;
grant execute on function public.best_times(uuid, integer) to anon, authenticated;
