-- Empty placeholder order lines do not produce a factory label. They must not
-- keep an otherwise completed order in the label-reprint warning state.
create or replace function public.mark_factory_order_line_printed(
  p_order_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if private.jwt_app_role() not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'factory_label_print_forbidden' using errcode = '42501';
  end if;

  select order_id into v_order_id
  from public.order_lines
  where id = p_order_line_id and not is_void;

  if v_order_id is null then
    raise exception 'factory_order_line_not_found' using errcode = 'P0002';
  end if;

  update public.order_lines
  set is_printed = true
  where id = p_order_line_id;

  update public.factory_order_line_changes
  set resolved_at = now(), resolved_by = auth.uid()
  where order_line_id = p_order_line_id
    and resolved_at is null;

  if not exists (
    select 1
    from public.order_lines
    where order_id = v_order_id
      and not is_void
      and not is_printed
      and (
        product_id is not null
        or nullif(trim(content_snapshot), '') is not null
        or nullif(trim(product_name_snapshot), '') is not null
      )
  ) and not exists (
    select 1 from public.factory_order_line_changes
    where order_id = v_order_id and resolved_at is null
  ) then
    update public.orders
    set factory_print_date = now(),
        factory_reprint_required = false,
        updated_at = now()
    where id = v_order_id;
  end if;
end;
$$;

revoke all on function public.mark_factory_order_line_printed(uuid) from public;
grant execute on function public.mark_factory_order_line_printed(uuid)
  to authenticated;

comment on function public.mark_factory_order_line_printed(uuid) is
  'Marks one printable factory label set complete and ignores empty placeholder lines when completing the order.';
