-- Allow Factory/Admin to update only the remarks field on raw meat stock rows.

create or replace function public.update_raw_meat_movement_remark(
  p_movement_id uuid,
  p_remarks text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  );
  next_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
  if caller_role not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'not authorized to update raw meat remarks'
      using errcode = '42501';
  end if;

  update public.raw_meat_stock_movements
  set remarks = next_remarks
  where id = p_movement_id;

  if not found then
    raise exception 'raw meat movement not found'
      using errcode = 'P0002';
  end if;

  return next_remarks;
end;
$$;

revoke all on function public.update_raw_meat_movement_remark(uuid, text)
  from public;
grant execute on function public.update_raw_meat_movement_remark(uuid, text)
  to authenticated;

comment on function public.update_raw_meat_movement_remark(uuid, text) is
  'Updates only remarks on a raw_meat_stock_movements row for Super Admin, Admin, or Factory.';
