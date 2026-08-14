-- Allow Admin/Factory to update raw meat option flags used by the options modal.

create or replace function public.update_raw_meat_item_flags(
  p_item_id uuid,
  p_can_ship_directly boolean,
  p_is_active boolean
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
begin
  if caller_role not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'not authorized to update raw meat item flags'
      using errcode = '42501';
  end if;

  update public.raw_meat_items
  set
    can_ship_directly = p_can_ship_directly,
    is_active = p_is_active,
    updated_at = now()
  where id = p_item_id
    and archived_at is null;

  if not found then
    raise exception 'raw meat item not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_raw_meat_item_flags(uuid, boolean, boolean)
  from public;
grant execute on function public.update_raw_meat_item_flags(uuid, boolean, boolean)
  to authenticated;

comment on function public.update_raw_meat_item_flags(uuid, boolean, boolean) is
  'Updates can_ship_directly and is_active on raw_meat_items for Super Admin, Admin, or Factory.';
