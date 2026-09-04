-- Generate the previous Hong Kong calendar day's customer-service report at
-- 09:15 HKT. Only production databases with an explicit Vault opt-in schedule it.

select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-customer-service-daily-report';

do $deployment$
begin
  if coalesce((
    select decrypted_secret from vault.decrypted_secrets
    where name = 'customer_service_daily_report_enabled' limit 1
  ), 'false') = 'true' then
    perform cron.schedule(
      'fccd-customer-service-daily-report',
      '15 1 * * *',
      $cron$
        select net.http_post(
          url := coalesce(
            (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'customer_service_daily_report_url' limit 1
            ),
            'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/customer-service-daily-report'
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'customer_service_daily_report_cron_secret' limit 1
            )
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 120000
        );
      $cron$
    );
  end if;
end;
$deployment$;
