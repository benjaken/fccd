update public.delivery_teams
set bank_account = 'SUN-LINE LOGISTICS CO,  渣打 - 40711305668'
where (
    lower(regexp_replace(name, '[^a-z0-9]+', '', 'g'))
      in ('sunline', 'sunlinelogistics', 'sunlinelogisticsco')
    or lower(regexp_replace(coalesce(short_name, ''), '[^a-z0-9]+', '', 'g'))
      in ('sunline', 'sunlinelogistics', 'sunlinelogisticsco')
  )
  and coalesce(btrim(bank_account), '') = '';
