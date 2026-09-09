-- Operations commits stock when a delivery is released to drivers. Do not
-- depend on fulfilled_at because drivers may record completion late or omit it.

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'private.record_delivered_delivery_material_consumption(uuid)'::regprocedure
  ) into v_definition;

  v_updated := replace(
    v_definition,
    'select delivery.order_id, delivery.delivery_at, delivery.fulfilled_at',
    'select delivery.order_id, delivery.delivery_at, coalesce(delivery.fulfilled_at, delivery.updated_at, now())'
  );
  v_updated := replace(
    v_updated,
    'and delivery.fulfilled_at is not null',
    'and delivery.delivery_status in (''待接單'', ''待取貨'', ''送貨途中'', ''已取'', ''已取貨'', ''已送達'', ''己送達'')'
  );

  if v_updated = v_definition
    or position('delivery.delivery_status in (''待接單''' in v_updated) = 0 then
    raise exception 'delivery_consumption_function_shape_changed';
  end if;

  execute v_updated;
end;
$migration$;

create or replace function private.consume_materials_when_delivery_fulfilled()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.delivery_status in (
    '待接單', '待取貨', '送貨途中', '已取', '已取貨', '已送達', '己送達'
  ) and (
    tg_op = 'INSERT'
    or old.delivery_status is distinct from new.delivery_status
  ) then
    perform private.record_delivered_delivery_material_consumption(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists consume_materials_when_delivery_fulfilled on public.deliveries;
create trigger consume_materials_when_delivery_fulfilled
after insert or update of delivery_status on public.deliveries
for each row execute function private.consume_materials_when_delivery_fulfilled();

-- Bring deliveries already waiting for a driver into the same ledger once.
select private.record_delivered_delivery_material_consumption(delivery.id)
from public.deliveries delivery
where delivery.delivery_status = '待接單';

comment on table public.order_material_consumptions is
  'Immutable BOM material deductions created once per delivery line when the delivery first reaches 待接單 or a later operational state.';
