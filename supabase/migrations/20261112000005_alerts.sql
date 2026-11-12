-- Week 4: email alerts when a personal monitor goes down and comes back up.
--
-- Delivery works like an outbox: incidents remember when each alert was sent.
-- Every checker run asks pending_alerts() what still needs sending, sends it,
-- then calls mark_alerts_sent(). A failed send is simply retried next run, and
-- overlapping runs can't double-send (marking is conditional).

-- ---------------------------------------------------------------------------
-- Delivery tracking on incidents
-- ---------------------------------------------------------------------------

alter table public.incidents
  add column down_alert_sent_at timestamptz,
  add column up_alert_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- Every personal monitor gets an alert setting (on, to the owner's email).
-- Flow 2 in the brief: sign up → add a site → get emailed when it goes down.
-- ---------------------------------------------------------------------------

create function public.create_default_alert_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is not null then
    insert into public.alert_settings (user_id, monitor_id, email, enabled)
    select new.owner_id, new.id, u.email, true
    from auth.users u
    where u.id = new.owner_id and u.email is not null
    on conflict (user_id, monitor_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger monitors_default_alert_setting
  after insert on public.monitors
  for each row execute function public.create_default_alert_setting();

revoke execute on function public.create_default_alert_setting() from public, anon, authenticated;

-- Backfill monitors created before this migration.
insert into public.alert_settings (user_id, monitor_id, email, enabled)
select m.owner_id, m.id, u.email, true
from public.monitors m
join auth.users u on u.id = m.owner_id
where m.owner_id is not null and u.email is not null
on conflict (user_id, monitor_id) do nothing;

-- ---------------------------------------------------------------------------
-- pending_alerts(): alerts that should be sent now.
--   'down' → incident open or closed, down alert not sent yet, started in
--            the last 24 h (never email about something long past)
--   'up'   → incident closed, up alert not sent, and the down alert WAS sent
--            (don't announce a recovery nobody was told about)
-- Skips monitors that already got 6+ alerts in the last hour (flapping).
-- Recipient = the account's current email, in the account's language.
-- Server-only (SECURITY DEFINER: reads auth.users).
-- ---------------------------------------------------------------------------

create function public.pending_alerts()
returns table (
  kind text,
  incident_id bigint,
  monitor_id uuid,
  monitor_name text,
  monitor_url text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  last_error text,
  alert_setting_id uuid,
  recipient text,
  locale text
)
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    -- alerts already sent per monitor in the last hour
    select i.monitor_id,
           count(*) filter (where i.down_alert_sent_at > now() - interval '1 hour')
         + count(*) filter (where i.up_alert_sent_at > now() - interval '1 hour') as sent_last_hour
    from public.incidents i
    group by i.monitor_id
  ),
  candidates as (
    select 'down'::text as kind, i.* from public.incidents i
    where i.down_alert_sent_at is null and i.started_at > now() - interval '24 hours'
    union all
    select 'up'::text, i.* from public.incidents i
    where i.ended_at is not null and i.up_alert_sent_at is null and i.down_alert_sent_at is not null
  )
  select
    c.kind,
    c.id,
    m.id,
    m.name,
    m.url,
    c.started_at,
    c.ended_at,
    c.duration_seconds,
    (select ch.error from public.checks ch
      where ch.monitor_id = m.id and ch.status = 'down' and ch.checked_at >= c.started_at
      order by ch.checked_at desc limit 1),
    s.id,
    u.email::text,
    coalesce(p.preferred_locale, 'fil')
  from candidates c
  join public.monitors m on m.id = c.monitor_id
  join public.alert_settings s on s.monitor_id = m.id and s.user_id = m.owner_id and s.enabled
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join recent r on r.monitor_id = m.id
  where m.owner_id is not null
    and u.email is not null
    and coalesce(r.sent_last_hour, 0) < 6
  order by c.started_at;
$$;

-- ---------------------------------------------------------------------------
-- mark_alerts_sent(): record delivery. Conditional, so a second run that sent
-- the same alert concurrently doesn't overwrite the first timestamp.
-- p_sent: [{ "incident_id": 1, "kind": "down" }, ...]
-- ---------------------------------------------------------------------------

create function public.mark_alerts_sent(p_sent jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with sent as (
    select (x ->> 'incident_id')::bigint as incident_id, x ->> 'kind' as kind
    from jsonb_array_elements(p_sent) as x
  ),
  down as (
    update public.incidents i set down_alert_sent_at = now()
    from sent s
    where s.kind = 'down' and i.id = s.incident_id and i.down_alert_sent_at is null
    returning i.id
  ),
  up as (
    update public.incidents i set up_alert_sent_at = now()
    from sent s
    where s.kind = 'up' and i.id = s.incident_id and i.up_alert_sent_at is null
    returning i.id
  )
  select ((select count(*) from down) + (select count(*) from up))::integer;
$$;

revoke execute on function public.pending_alerts() from public, anon, authenticated;
revoke execute on function public.mark_alerts_sent(jsonb) from public, anon, authenticated;
grant execute on function public.pending_alerts() to service_role;
grant execute on function public.mark_alerts_sent(jsonb) to service_role;
