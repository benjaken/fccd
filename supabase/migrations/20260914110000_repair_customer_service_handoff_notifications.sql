-- Restore customer-service handoff notifications when the optional dedicated
-- Vault values were never provisioned. The shared WATI cron secret is already
-- accepted by the Edge Function and is the production fallback.

select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-customer-service-handoff-digest';

do $deployment$
declare
  v_secret text;
begin
  select coalesce(
    (select decrypted_secret
      from vault.decrypted_secrets
      where name = 'customer_service_handoff_cron_secret'
      limit 1),
    (select decrypted_secret
      from vault.decrypted_secrets
      where name = 'wati_order_cron_secret'
      limit 1)
  ) into v_secret;

  if nullif(btrim(coalesce(v_secret, '')), '') is null then
    raise exception 'customer_service_handoff_cron_secret_missing';
  end if;

  perform cron.schedule(
    'fccd-customer-service-handoff-digest',
    '0 1 * * *',
    $cron$
      select net.http_post(
        url := coalesce(
          (select decrypted_secret
            from vault.decrypted_secrets
            where name = 'customer_service_handoff_digest_url'
            limit 1),
          'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/wati-customer-service'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (select decrypted_secret
              from vault.decrypted_secrets
              where name = 'customer_service_handoff_cron_secret'
              limit 1),
            (select decrypted_secret
              from vault.decrypted_secrets
              where name = 'wati_order_cron_secret'
              limit 1)
          )
        ),
        body := '{"mode":"handoff_digest"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
end;
$deployment$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-customer-service-outbound-retry';

do $deployment$
declare
  v_secret text;
begin
  select coalesce(
    (select decrypted_secret
      from vault.decrypted_secrets
      where name = 'customer_service_outbound_cron_secret'
      limit 1),
    (select decrypted_secret
      from vault.decrypted_secrets
      where name = 'customer_service_handoff_cron_secret'
      limit 1),
    (select decrypted_secret
      from vault.decrypted_secrets
      where name = 'wati_order_cron_secret'
      limit 1)
  ) into v_secret;

  if nullif(btrim(coalesce(v_secret, '')), '') is null then
    raise exception 'customer_service_outbound_cron_secret_missing';
  end if;

  perform cron.schedule(
    'fccd-customer-service-outbound-retry',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := coalesce(
          (select decrypted_secret
            from vault.decrypted_secrets
            where name = 'customer_service_outbound_retry_url'
            limit 1),
          (select decrypted_secret
            from vault.decrypted_secrets
            where name = 'customer_service_handoff_digest_url'
            limit 1),
          'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/wati-customer-service'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce(
            (select decrypted_secret
              from vault.decrypted_secrets
              where name = 'customer_service_outbound_cron_secret'
              limit 1),
            (select decrypted_secret
              from vault.decrypted_secrets
              where name = 'customer_service_handoff_cron_secret'
              limit 1),
            (select decrypted_secret
              from vault.decrypted_secrets
              where name = 'wati_order_cron_secret'
              limit 1)
          )
        ),
        body := '{"mode":"retry_outbound"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  );
end;
$deployment$;
