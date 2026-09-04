-- Reuse the existing customer-service cron endpoint and secret when dedicated
-- outbound retry Vault values have not been configured yet.

select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-customer-service-outbound-retry';

do $deployment$
declare
  v_url text;
  v_secret text;
begin
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets
      where name = 'customer_service_outbound_retry_url' limit 1),
    (select decrypted_secret from vault.decrypted_secrets
      where name = 'customer_service_handoff_digest_url' limit 1)
  ) into v_url;
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets
      where name = 'customer_service_outbound_cron_secret' limit 1),
    (select decrypted_secret from vault.decrypted_secrets
      where name = 'customer_service_handoff_cron_secret' limit 1)
  ) into v_secret;

  if nullif(btrim(coalesce(v_url, '')), '') is not null
     and nullif(btrim(coalesce(v_secret, '')), '') is not null then
    perform cron.schedule(
      'fccd-customer-service-outbound-retry',
      '*/5 * * * *',
      format(
        $cron$
          select net.http_post(
            url := %L,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-cron-secret', %L
            ),
            body := '{"mode":"retry_outbound"}'::jsonb,
            timeout_milliseconds := 120000
          );
        $cron$,
        v_url,
        v_secret
      )
    );
  end if;
end;
$deployment$;
