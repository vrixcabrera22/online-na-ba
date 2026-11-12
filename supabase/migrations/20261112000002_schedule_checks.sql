-- Run the checker every 5 minutes.
--
-- Vercel's free Hobby plan only runs cron jobs once a day, so the schedule
-- lives in Supabase instead: pg_cron fires every 5 minutes and pg_net sends a
-- POST to the protected /api/cron/check route on Vercel.
--
-- The site URL and the shared secret are read from Supabase Vault at run time,
-- so neither is stored in this repo. Create them once (SQL editor or CLI):
--
--   select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET on Vercel>', 'cron_secret');
--
-- To change one later: select vault.update_secret(id, 'new value') using the
-- id from vault.secrets.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Re-running cron.schedule with the same name replaces the job.
select cron.schedule(
  'check-monitors',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
           || '/api/cron/check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
      )
    ),
    body := '{}'::jsonb,
    -- A run takes ~15 s at worst; wait long enough that the request isn't cut
    -- off before the route finishes.
    timeout_milliseconds := 60000
  );
  $$
);
