-- Restaurant replenishment orders use the same delivery details as the
-- original frozen-goods outbound flow.  Values are snapshotted on the parent
-- order so every supplier request prints one consistent delivery note.

alter table public.shop_order_batches
  add column if not exists shipping_method_id uuid
    references public.meat_shipping_methods (id),
  add column if not exists contact_person text,
  add column if not exists phone text,
  add column if not exists delivery_address text;

create index if not exists shop_order_batches_shipping_method_idx
  on public.shop_order_batches (shipping_method_id);

create or replace function public.shop_order_delivery_form_options(
  p_restaurant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_restaurant_id uuid := p_restaurant_id;
  v_restaurant_name text;
  v_profile jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.has_page_access('workspace.restaurant.shop_order')
    and not private.has_page_access('restaurant.ordering.review') then
    raise exception 'shop_order_delivery_options_forbidden' using errcode = '42501';
  end if;

  if v_restaurant_id is null
    and private.has_page_access('workspace.restaurant.shop_order') then
    select profile.shop_restro_id into v_restaurant_id
    from public.user_profiles profile
    where profile.id = auth.uid();
  end if;

  if v_restaurant_id is not null
    and not private.has_page_access('restaurant.ordering.review')
    and not exists (
      select 1 from public.user_profiles profile
      where profile.id = auth.uid()
        and profile.shop_restro_id = v_restaurant_id
    ) then
    raise exception 'shop_order_restaurant_mismatch' using errcode = '42501';
  end if;

  select restaurant.name into v_restaurant_name
  from public.restaurants restaurant
  where restaurant.id = v_restaurant_id;

  if v_restaurant_name is not null then
    select jsonb_build_object(
      'shippingMethodId', (
        select meat_order.shipping_method_id
        from public.meat_orders meat_order
        where meat_order.meat_customer_id = customer.id
          and meat_order.shipping_method_id is not null
        order by meat_order.shipping_at desc nulls last, meat_order.created_at desc
        limit 1
      ),
      'contactPerson', customer.contact_person,
      'phone', customer.phone,
      'address', customer.address
    ) into v_profile
    from public.meat_customers customer
    where lower(btrim(customer.name)) = lower(btrim(v_restaurant_name))
       or lower(customer.name) like '%' || lower(btrim(v_restaurant_name)) || '%'
       or lower(v_restaurant_name) like '%' || lower(btrim(customer.name)) || '%'
       or (lower(customer.name) like '%tko%' and lower(v_restaurant_name) like '%tko%')
       or (customer.name like '%桂花小幸%' and v_restaurant_name like '%桂花小幸%')
    order by (lower(btrim(customer.name)) = lower(btrim(v_restaurant_name))) desc,
             customer.updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'shippingMethods', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', method.id, 'name', method.name)
        order by method.name
      )
      from public.meat_shipping_methods method
      where method.archived_at is null
        and nullif(btrim(method.name), '') is not null
    ), '[]'::jsonb),
    'profile', v_profile
  );
end;
$$;

revoke all on function public.shop_order_delivery_form_options(uuid) from public;
grant execute on function public.shop_order_delivery_form_options(uuid) to authenticated;

create or replace function public.shop_update_order_delivery_details(
  p_batch_id uuid,
  p_shipping_method_id uuid,
  p_contact_person text,
  p_phone text,
  p_delivery_address text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_restaurant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_shipping_method_id is null
    or nullif(btrim(p_contact_person), '') is null then
    raise exception 'shop_order_delivery_details_required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.meat_shipping_methods method
    where method.id = p_shipping_method_id and method.archived_at is null
  ) then
    raise exception 'invalid_shop_order_shipping_method' using errcode = '22023';
  end if;

  select batch.restaurant_id into v_restaurant_id
  from public.shop_order_batches batch
  where batch.id = p_batch_id;
  if v_restaurant_id is null then
    raise exception 'shop_order_batch_not_found' using errcode = 'P0002';
  end if;

  if not private.has_page_access('restaurant.ordering.review') then
    if not private.has_page_access('workspace.restaurant.shop_order')
      or not exists (
        select 1 from public.user_profiles profile
        where profile.id = auth.uid()
          and profile.shop_restro_id = v_restaurant_id
      )
      or exists (
        select 1 from public.shop_order_requests request
        where request.order_batch_id = p_batch_id
          and request.channel = 'fc_internal'
          and request.status not in ('submitted', 'rejected')
      ) then
      raise exception 'shop_order_delivery_update_forbidden' using errcode = '42501';
    end if;
  end if;

  update public.shop_order_batches
  set
    shipping_method_id = p_shipping_method_id,
    contact_person = nullif(btrim(p_contact_person), ''),
    phone = nullif(btrim(p_phone), ''),
    delivery_address = nullif(btrim(p_delivery_address), ''),
    updated_at = now()
  where id = p_batch_id;
end;
$$;

revoke all on function public.shop_update_order_delivery_details(
  uuid, uuid, text, text, text
) from public;
grant execute on function public.shop_update_order_delivery_details(
  uuid, uuid, text, text, text
) to authenticated;

-- Preserve useful information for orders created before these fields existed.
-- Restaurant and frozen-outbound customer masters carry the same shop name.
update public.shop_order_batches batch
set
  contact_person = coalesce(batch.contact_person, profile.contact_person),
  phone = coalesce(batch.phone, profile.phone),
  delivery_address = coalesce(batch.delivery_address, profile.address),
  shipping_method_id = coalesce(batch.shipping_method_id, profile.shipping_method_id)
from public.restaurants restaurant
join lateral (
  select
    customer.contact_person,
    customer.phone,
    customer.address,
    (
      select meat_order.shipping_method_id
      from public.meat_orders meat_order
      where meat_order.meat_customer_id = customer.id
        and meat_order.shipping_method_id is not null
      order by meat_order.shipping_at desc nulls last, meat_order.created_at desc
      limit 1
    ) as shipping_method_id
  from public.meat_customers customer
  where lower(btrim(customer.name)) = lower(btrim(restaurant.name))
     or lower(customer.name) like '%' || lower(btrim(restaurant.name)) || '%'
     or lower(restaurant.name) like '%' || lower(btrim(customer.name)) || '%'
     or (lower(customer.name) like '%tko%' and lower(restaurant.name) like '%tko%')
     or (customer.name like '%桂花小幸%' and restaurant.name like '%桂花小幸%')
  order by (lower(btrim(customer.name)) = lower(btrim(restaurant.name))) desc,
           customer.updated_at desc
  limit 1
) profile on true
where batch.restaurant_id = restaurant.id
  and (
    batch.contact_person is null
    or batch.phone is null
    or batch.delivery_address is null
    or batch.shipping_method_id is null
  );

create or replace function public.shop_create_order_batch(
  p_restaurant_id uuid,
  p_delivery_date date,
  p_note text,
  p_groups jsonb,
  p_shipping_method_id uuid,
  p_contact_person text,
  p_phone text,
  p_delivery_address text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_batch_id uuid;
begin
  if p_shipping_method_id is null then
    raise exception 'shop_order_shipping_method_required' using errcode = '22023';
  end if;
  if nullif(btrim(p_contact_person), '') is null then
    raise exception 'shop_order_contact_person_required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.meat_shipping_methods method
    where method.id = p_shipping_method_id and method.archived_at is null
  ) then
    raise exception 'invalid_shop_order_shipping_method' using errcode = '22023';
  end if;

  v_batch_id := public.shop_create_order_batch(
    p_restaurant_id,
    p_delivery_date,
    p_note,
    p_groups
  );

  update public.shop_order_batches
  set
    shipping_method_id = p_shipping_method_id,
    contact_person = nullif(btrim(p_contact_person), ''),
    phone = nullif(btrim(p_phone), ''),
    delivery_address = nullif(btrim(p_delivery_address), ''),
    updated_at = now()
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

revoke all on function public.shop_create_order_batch(
  uuid, date, text, jsonb, uuid, text, text, text
) from public;
grant execute on function public.shop_create_order_batch(
  uuid, date, text, jsonb, uuid, text, text, text
) to authenticated;
