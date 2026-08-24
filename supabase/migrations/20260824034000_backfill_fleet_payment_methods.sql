-- The UI calls this value a payment method. The legacy database column remains
-- bank_account for compatibility with the deployed fleet-management RPCs.
-- Normalize case before stripping punctuation so mixed-case names such as
-- "Sun-Line" are matched correctly.

update public.delivery_teams
set bank_account = 'SUN-LINE LOGISTICS CO,  渣打 - 40711305668',
    updated_at = now()
where (
    regexp_replace(lower(name), '[^a-z0-9]+', '', 'g')
      in ('sunline', 'sunlinelogistics', 'sunlinelogisticsco')
    or regexp_replace(lower(coalesce(short_name, '')), '[^a-z0-9]+', '', 'g')
      in ('sunline', 'sunlinelogistics', 'sunlinelogisticsco')
  )
  and coalesce(btrim(bank_account), '') = '';
