-- Factory dish-label printing and reprint invalidation.
alter table public.orders
  add column if not exists factory_reprint_required boolean not null default false;

create or replace function private.invalidate_factory_label_print()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order_id uuid;
  v_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    v_order_id := new.order_id;
    v_changed := true;
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
    v_changed := true;
  else
    v_order_id := coalesce(new.order_id, old.order_id);
    v_changed := row(
      new.order_id,
      new.product_id,
      new.package_id,
      new.product_name_snapshot,
      new.content_snapshot,
      new.quantity,
      new.new_quantity_text,
      new.remarks_1,
      new.remarks_2,
      new.is_addon,
      new.is_void
    ) is distinct from row(
      old.order_id,
      old.product_id,
      old.package_id,
      old.product_name_snapshot,
      old.content_snapshot,
      old.quantity,
      old.new_quantity_text,
      old.remarks_1,
      old.remarks_2,
      old.is_addon,
      old.is_void
    );
    if v_changed then
      new.is_printed := false;
    end if;
  end if;

  if v_changed and v_order_id is not null then
    update public.orders
    set factory_reprint_required = true
    where id = v_order_id
      and factory_print_date is not null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists order_lines_invalidate_factory_label_print
  on public.order_lines;
create trigger order_lines_invalidate_factory_label_print
before insert or update or delete on public.order_lines
for each row execute function private.invalidate_factory_label_print();

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

  if not exists (
    select 1 from public.order_lines
    where order_id = v_order_id and not is_void and not is_printed
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
  'Marks one factory dish label set printed after QZ Tray succeeds. Completes the order print only when every active line is printed.';
