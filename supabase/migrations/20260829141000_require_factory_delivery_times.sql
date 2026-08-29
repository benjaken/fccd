-- An order cannot enter the factory workflow until both operational times are
-- present. Enforce this at the database boundary so every UI and RPC path uses
-- the same rule.

create or replace function private.validate_order_factory_required_fields()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.document_type = 'order'
    and coalesce(new.is_sent_to_factory, false)
    and (tg_op = 'INSERT' or old.is_sent_to_factory is distinct from true)
  then
    if new.channel_id is null then
      raise exception 'order_factory_brand_required' using errcode = '22023';
    end if;

    if nullif(btrim(new.customer_name_snapshot), '') is null then
      raise exception 'order_factory_customer_name_required' using errcode = '22023';
    end if;

    if nullif(btrim(new.contact_number_a_snapshot), '') is null then
      raise exception 'order_factory_phone_required' using errcode = '22023';
    end if;

    if nullif(btrim(new.email_snapshot), '') is null then
      raise exception 'order_factory_email_required' using errcode = '22023';
    end if;

    if new.shipping_method_id is null then
      raise exception 'order_factory_shipping_method_required' using errcode = '22023';
    end if;

    if new.delivery_district_id is null then
      raise exception 'order_factory_district_required' using errcode = '22023';
    end if;

    if new.delivery_at is null then
      raise exception 'order_factory_delivery_date_required' using errcode = '22023';
    end if;

    if nullif(btrim(new.delivery_time), '') is null then
      raise exception 'order_factory_delivery_time_required' using errcode = '22023';
    end if;

    if nullif(btrim(new.ship_out_time), '') is null then
      raise exception 'order_factory_ship_out_time_required' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_order_factory_required_fields
  on public.orders;
create trigger validate_order_factory_required_fields
before insert or update on public.orders
for each row execute function private.validate_order_factory_required_fields();

comment on function private.validate_order_factory_required_fields() is
  'Requires brand, customer name, phone, email, shipping method, district, delivery date, delivery time, and ship-out time before an order is sent to the factory.';

-- This order was sent before the missing production-time validation existed.
-- Return it to the unsent queue; its existing delivery record is retained.
update public.orders as generated
set is_sent_to_factory = false,
    updated_at = now()
from public.orders as quote
where generated.source_quote_id = quote.id
  and generated.order_number = 'B-1557'
  and quote.order_number = 'FCBQ20260843'
  and generated.document_type = 'order'
  and generated.archived_at is null
  and coalesce(generated.is_sent_to_factory, false)
  and (
    nullif(btrim(generated.delivery_time), '') is null
    or nullif(btrim(generated.ship_out_time), '') is null
  );
