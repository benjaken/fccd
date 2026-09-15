-- Scheduling is automatic once both environment-specific Vault secrets exist.
-- There is no second UI click/feature flag, and no production URL fallback.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-customer-service-daily-report';

do $deployment$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets
  where name = 'customer_service_daily_report_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets
  where name = 'customer_service_daily_report_cron_secret' limit 1;
  if nullif(btrim(v_url), '') is not null and nullif(btrim(v_secret), '') is not null then
    perform cron.schedule(
      'fccd-customer-service-daily-report',
      '15 1 * * *',
      format($cron$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
          body := '{}'::jsonb,
          timeout_milliseconds := 120000
        );
      $cron$, v_url, v_secret)
    );
  end if;
end;
$deployment$;
