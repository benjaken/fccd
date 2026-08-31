-- Reconcile deployment state without touching order data. Develop databases
-- do not carry the production opt-in and therefore retain no alert schedules.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'fccd-shopify-order-daily-reconciliation',
  'fccd-order-reconciliation-alerts'
);

do $deployment$
begin
  if coalesce((
    select decrypted_secret from vault.decrypted_secrets
    where name = 'order_reconciliation_notifications_enabled' limit 1
  ), 'false') = 'true' then
    perform cron.schedule(
      'fccd-shopify-order-daily-reconciliation',
      '45 0 * * *',
      $cron$
        select net.http_post(
          url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/shopify-order-sync',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'bubble_daily_cron_secret' limit 1
            )
          ),
          body := jsonb_build_object(
            'mode', 'reconcile',
            'updated_at_min', to_char(
              (now() at time zone 'Asia/Hong_Kong') - interval '1 month',
              'YYYY-MM-DD"T"HH24:MI:SSOF'
            )
          ),
          timeout_milliseconds := 90000
        );
      $cron$
    );

    perform cron.schedule(
      'fccd-order-reconciliation-alerts',
      '* * * * *',
      $cron$
        select net.http_post(
          url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/wati-order-notifications',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'wati_order_cron_secret' limit 1
            )
          ),
          body := jsonb_build_object(
            'mode', 'reconciliation_only',
            'limit', 100
          ),
          timeout_milliseconds := 90000
        );
      $cron$
    );
  end if;
end;
$deployment$;
