-- Schedule the rollup and cleanup inside Supabase (pg_cron). Pure SQL: no
-- HTTP call to Vercel needed. cron.schedule with an existing name replaces it.

-- Every hour at :05, summarize the last 48 hours of finished hours.
select cron.schedule(
  'rollup-hourly-stats',
  '5 * * * *',
  $$ select public.rollup_hourly_stats(); $$
);

-- Daily at 16:10 UTC (12:10 AM Manila): delete raw checks older than 30 days,
-- and trim pg_cron's own run log, which otherwise grows forever.
select cron.schedule(
  'cleanup-old-data',
  '10 16 * * *',
  $$
    select public.cleanup_old_checks();
    delete from cron.job_run_details where end_time < now() - interval '7 days';
  $$
);
