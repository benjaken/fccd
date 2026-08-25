create or replace function private.validate_order_factory_required_fields()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.document_type = 'order'
    and coalesce(new.is_sent_to_factory, false)
    and old.is_sent_to_factory is distinct from true
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
  end if;

  return new;
end;
$$;

drop trigger if exists validate_order_factory_required_fields
  on public.orders;
create trigger validate_order_factory_required_fields
before update of is_sent_to_factory on public.orders
for each row execute function private.validate_order_factory_required_fields();

comment on function private.validate_order_factory_required_fields() is
  'Requires brand, customer name, phone, email, shipping method, district, and delivery date before an order is sent to the factory.';
