create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- pg_cron uses UTC. These jobs start at 08:00 Asia/Hong_Kong and are
-- deliberately staggered to preserve FK dependency order and avoid concurrent
-- Edge Function pressure. The Edge Function refuses calls unless the Vault
-- secret named bubble_daily_cron_secret matches its BUBBLE_CRON_SECRET.
select cron.schedule(
  'fccd-bubble-incremental-a',
  '0 0 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-daily-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret'
          limit 1
        )
      ),
      body := '{"phase":"a"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

select cron.schedule(
  'fccd-bubble-incremental-b',
  '3 0 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-daily-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"phase":"b"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

select cron.schedule(
  'fccd-bubble-incremental-c',
  '6 0 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-daily-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"phase":"c"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

select cron.schedule(
  'fccd-bubble-incremental-d1',
  '9 0 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-daily-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"phase":"d1"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

select cron.schedule(
  'fccd-bubble-incremental-d2',
  '12 0 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-daily-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"phase":"d2"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

select cron.schedule(
  'fccd-bubble-incremental-e',
  '15 0 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-daily-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"phase":"e"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

select cron.schedule(
  'fccd-bubble-incremental-remaining',
  '18 0 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-daily-incremental',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"phase":"remaining"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

-- Keep operational history bounded.
select cron.schedule(
  'fccd-cron-history-cleanup',
  '40 0 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '30 days'$$
);
