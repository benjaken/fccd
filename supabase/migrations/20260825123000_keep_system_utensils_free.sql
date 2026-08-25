create or replace function private.keep_system_utensil_lines_free()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.legacy_id like 'web-order-utensil-%'
    or new.legacy_id like 'web-quote-utensil-%'
    or new.legacy_id like 'shopify:%:utensils'
  then
    new.unit_price := 0;
    new.total_price := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_system_utensil_lines_free
  on public.order_lines;
create trigger keep_system_utensil_lines_free
before insert or update of legacy_id, unit_price, total_price
on public.order_lines
for each row execute function private.keep_system_utensil_lines_free();

with affected as (
  update public.order_lines
  set unit_price = 0,
      total_price = 0,
      updated_at = now()
  where (
      legacy_id like 'web-order-utensil-%'
      or legacy_id like 'web-quote-utensil-%'
      or legacy_id like 'shopify:%:utensils'
    )
    and (coalesce(unit_price, 0) <> 0 or coalesce(total_price, 0) <> 0)
  returning order_id
), recalculated as (
  select
    orders.id,
    greatest(
      coalesce(sum(lines.total_price) filter (where not lines.is_void), 0)
      + coalesce(orders.shipping_fee, 0)
      - coalesce(orders.discount_amount, 0)
      - coalesce(orders.cashdollar_redeemed, 0),
      0
    ) as grand_total,
    coalesce((
      select sum(payments.amount)
      from public.payments
      where payments.order_id = orders.id
        and payments.voided_at is null
    ), 0) as paid_total
  from public.orders as orders
  left join public.order_lines as lines on lines.order_id = orders.id
  where orders.id in (select order_id from affected)
  group by orders.id
)
update public.orders as orders
set grand_total = recalculated.grand_total,
    outstanding = greatest(recalculated.grand_total - recalculated.paid_total, 0),
    updated_at = now()
from recalculated
where orders.id = recalculated.id;
