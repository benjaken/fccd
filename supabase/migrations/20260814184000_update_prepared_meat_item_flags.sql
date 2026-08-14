-- Allow Super Admin / Admin / Factory to toggle prepared meat option active flags.

create or replace function public.update_prepared_meat_item_flags(
  p_item_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_page_access('frozen.prepared_meat_inventory') then
    raise exception 'not authorized to update prepared meat item flags'
      using errcode = '42501';
  end if;

  update public.prepared_meat_items
  set
    is_active = p_is_active,
    updated_at = now()
  where id = p_item_id
    and archived_at is null;

  if not found then
    raise exception 'prepared meat item not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_prepared_meat_item_flags(uuid, boolean)
  from public;
grant execute on function public.update_prepared_meat_item_flags(uuid, boolean)
  to authenticated;

comment on function public.update_prepared_meat_item_flags(uuid, boolean) is
  'Updates is_active on prepared_meat_items for roles that can open 製成品存貨計算.';
