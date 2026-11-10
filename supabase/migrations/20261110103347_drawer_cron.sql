-- Hourly Telegram prompts and housekeeping for 이력서랍.
-- Vercel Hobby cron cannot run hourly, so Postgres calls the app instead.
--
-- Before applying, store these in Supabase Vault (Dashboard > Project Settings > Vault,
-- or SQL editor), never in this file:
--   select vault.create_secret('https://<production-domain>', 'drawer_app_url');
--   select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'drawer_cron_secret');
-- pg_cron runs in UTC; the endpoint converts to KST itself.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'drawer-hourly-notify',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'drawer_app_url')
      || '/api/cron/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'drawer_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'drawer-cleanup',
  '17 * * * *',
  $$
  delete from public.telegram_updates where received_at < now() - interval '7 days';
  delete from public.pending_logs where expires_at < now();
  delete from public.telegram_link_tokens where expires_at < now() - interval '1 day';
  $$
);
