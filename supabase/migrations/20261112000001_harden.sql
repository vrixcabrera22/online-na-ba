-- Fixes from the Supabase security/performance advisors.

-- 1. Trigger functions were callable through the API (/rest/v1/rpc/...).
--    Postgres refuses to run a trigger function outside a trigger, but they
--    shouldn't be exposed at all. Triggers still fire: they don't need EXECUTE.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_monitor_limit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 2. Two permissive SELECT policies on monitors meant both ran for every row.
--    Merge them into one with the same meaning.
drop policy "Anyone reads public monitors" on public.monitors;
drop policy "Users read own monitors" on public.monitors;

create policy "Read public or own monitors" on public.monitors
  for select to anon, authenticated
  using (is_public or owner_id = (select auth.uid()));
