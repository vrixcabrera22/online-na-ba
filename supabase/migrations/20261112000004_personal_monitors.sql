-- Week 3: personal monitors on the dashboard.

-- ---------------------------------------------------------------------------
-- my_monitors(): the signed-in user's monitors (including paused ones) with
-- their latest check and uptime. Same columns as status_board() plus
-- is_active. Returns nothing for visitors who aren't signed in.
-- SECURITY INVOKER + owner filter: users only ever see their own rows.
-- ---------------------------------------------------------------------------

create function public.my_monitors(p_id uuid default null)
returns table (
  id uuid,
  name text,
  url text,
  is_active boolean,
  created_at timestamptz,
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
    m.id, m.name, m.url, m.is_active, m.created_at,
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
  where m.owner_id = (select auth.uid())
    and (p_id is null or m.id = p_id)
  order by m.created_at;
$$;

revoke execute on function public.my_monitors(uuid) from public, anon;
grant execute on function public.my_monitors(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Stricter URL rules for monitors (defense in depth; the app checks too, and
-- the checker re-checks the resolved IP address before every request).
--   - no credentials in the URL (https://user:pass@host)
--   - no obviously internal hosts: localhost, *.local, *.internal, and
--     literal private / loopback / link-local IPv4 and IPv6 addresses
-- ---------------------------------------------------------------------------

alter table public.monitors
  add constraint monitors_url_no_credentials
    check (url !~ '^[a-zA-Z]+://[^/?#]*@'),
  add constraint monitors_url_not_internal
    check (
      lower(substring(url from '^[a-zA-Z]+://([^/:?#]+|\[[^\]]+\])')) !~
        '^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.[0-9.]+|10\.[0-9.]+|192\.168\.[0-9.]+|169\.254\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|\[.*\])$'
    );
