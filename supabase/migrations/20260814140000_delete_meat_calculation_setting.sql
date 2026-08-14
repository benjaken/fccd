-- Allow deleting calculation settings, but keep at least one row.
-- If the deleted row was applied, activate the newest remaining row.

alter table public.meat_calculation_settings
  drop constraint if exists meat_calculation_settings_variation_rate_pct_check;

alter table public.meat_calculation_settings
  drop constraint if exists meat_calculation_settings_markup_rate_pct_check;

alter table public.meat_calculation_settings
  add constraint meat_calculation_settings_variation_rate_pct_check
  check (
    variation_rate is null
    or (variation_rate >= 0 and variation_rate <= 1)
  );

alter table public.meat_calculation_settings
  add constraint meat_calculation_settings_markup_rate_pct_check
  check (
    markup_rate is null
    or (markup_rate >= 0 and markup_rate <= 1)
  );

create or replace function public.delete_meat_calculation_setting(
  p_setting_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  );
  remaining integer;
  was_applied boolean;
  fallback_id uuid;
begin
  if caller_role not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'not authorized to delete calculation settings'
      using errcode = '42501';
  end if;

  select count(*) into remaining
  from public.meat_calculation_settings;

  if remaining <= 1 then
    raise exception 'at least one calculation setting must remain'
      using errcode = 'P0001';
  end if;

  select is_applied into was_applied
  from public.meat_calculation_settings
  where id = p_setting_id;

  if not found then
    raise exception 'calculation setting not found'
      using errcode = 'P0002';
  end if;

  if was_applied then
    select id into fallback_id
    from public.meat_calculation_settings
    where id <> p_setting_id
    order by coalesce(bubble_created_at, created_at) desc, created_at desc
    limit 1;

    if fallback_id is not null then
      update public.meat_calculation_settings
      set
        is_applied = true,
        updated_at = now()
      where id = fallback_id;
    end if;
  end if;

  delete from public.meat_calculation_settings
  where id = p_setting_id;
end;
$$;

revoke all on function public.delete_meat_calculation_setting(uuid)
  from public;
grant execute on function public.delete_meat_calculation_setting(uuid)
  to authenticated;

comment on function public.delete_meat_calculation_setting(uuid) is
  'Deletes a meat_calculation_settings row if more than one remains. If the deleted row was applied, activates the newest remaining row.';
