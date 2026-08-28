-- Dispatch internal new-order notifications once per minute. The shared secret
-- is stored in Vault and must match the WATI_ORDER_CRON_SECRET Edge secret.

do $$
declare
  v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname = 'fccd-order-internal-notifications';

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end;
$$;

select cron.schedule(
  'fccd-order-internal-notifications',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/wati-order-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'wati_order_cron_secret'
          limit 1
        )
      ),
      body := '{"limit":20}'::jsonb,
      timeout_milliseconds := 50000
    );
  $$
);
