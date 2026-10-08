-- Confirming a factory print (including the order editor's "already printed"
-- save) used to leave factory_order_line_changes open. The factory order page
-- then kept the red reprint corner on lines that were already printed.
--
-- Close those rows once the order's reprint flag is cleared and a print time
-- is recorded. Also restore the jobs the factory already printed on 1-3 Oct
-- 2026 but which were still stored as unprinted: P-1158, #7040, #7038, K-2161,
-- and the leftover 檸檬茶 change on P-1161.

create or replace function private.resolve_factory_line_changes_after_confirmed_print()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.factory_reprint_required or new.factory_print_date is null then
    return new;
  end if;

  if old.factory_reprint_required is not distinct from new.factory_reprint_required
     and old.factory_print_date is not distinct from new.factory_print_date then
    return new;
  end if;

  update public.factory_order_line_changes
  set resolved_at = now(),
      resolved_by = auth.uid()
  where order_id = new.id
    and resolved_at is null;

  return new;
end;
$$;

drop trigger if exists orders_resolve_factory_line_changes on public.orders;
create trigger orders_resolve_factory_line_changes
after update of factory_reprint_required, factory_print_date on public.orders
for each row
execute function private.resolve_factory_line_changes_after_confirmed_print();

update public.order_lines
set is_printed = true
where order_id in (
  '31497b2f-dc62-41f5-84dd-b1171579e65b', -- P-1158
  'eef86b8c-4bc1-4e5d-b37c-3b1e652228dd', -- #7040
  'ab501ef4-ca52-4056-bf98-2dde96deccf5', -- #7038
  '93b4a9ff-6a71-4d4e-9d19-c0472dda7d69'  -- K-2161
)
  and not is_void
  and not is_printed;

update public.orders
set factory_print_date = coalesce(factory_print_date, now()),
    factory_reprint_required = false,
    updated_at = now()
where id in (
  '31497b2f-dc62-41f5-84dd-b1171579e65b',
  'eef86b8c-4bc1-4e5d-b37c-3b1e652228dd',
  'ab501ef4-ca52-4056-bf98-2dde96deccf5',
  '93b4a9ff-6a71-4d4e-9d19-c0472dda7d69',
  'b9cbd362-29f3-4839-8fd6-a5d574fe6e4b' -- P-1161
);

update public.factory_order_line_changes
set resolved_at = coalesce(resolved_at, now())
where order_id in (
  '31497b2f-dc62-41f5-84dd-b1171579e65b',
  'eef86b8c-4bc1-4e5d-b37c-3b1e652228dd',
  'ab501ef4-ca52-4056-bf98-2dde96deccf5',
  '93b4a9ff-6a71-4d4e-9d19-c0472dda7d69',
  'b9cbd362-29f3-4839-8fd6-a5d574fe6e4b'
)
  and resolved_at is null;

update public.factory_change_tasks
set needs_label_reprint = false
where order_id in (
  '31497b2f-dc62-41f5-84dd-b1171579e65b',
  'eef86b8c-4bc1-4e5d-b37c-3b1e652228dd',
  'ab501ef4-ca52-4056-bf98-2dde96deccf5',
  '93b4a9ff-6a71-4d4e-9d19-c0472dda7d69',
  'b9cbd362-29f3-4839-8fd6-a5d574fe6e4b'
)
  and needs_label_reprint;
