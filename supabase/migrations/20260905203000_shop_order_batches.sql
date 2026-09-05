-- One customer-facing order can contain several supplier fulfilment requests.
-- Existing request rows remain as supplier-specific operational units for FC
-- review, warehouse and external dispatch, while records use the parent order.

create table if not exists public.shop_order_batches (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default public.shop_order_next_request_no(),
  restaurant_id uuid not null references public.restaurants (id),
  delivery_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_order_requests
  add column if not exists order_batch_id uuid references public.shop_order_batches (id);

insert into public.shop_order_batches (
  order_no, restaurant_id, delivery_date, note, created_by, created_at, updated_at
)
select
  request_no, restaurant_id, delivery_date, note, created_by, created_at, updated_at
from public.shop_order_requests
where order_batch_id is null
on conflict (order_no) do nothing;

update public.shop_order_requests request
set order_batch_id = batch.id
from public.shop_order_batches batch
where request.order_batch_id is null
  and batch.order_no = request.request_no;

create index if not exists shop_order_requests_batch_idx
  on public.shop_order_requests (order_batch_id);

alter table public.shop_order_batches enable row level security;

drop policy if exists "Shop order batch readers" on public.shop_order_batches;
create policy "Shop order batch readers"
  on public.shop_order_batches for select to authenticated
  using (
    private.has_page_access('workspace.restaurant')
    or private.has_page_access('restaurant.ordering')
  );

drop policy if exists "Shop order batch writers" on public.shop_order_batches;
create policy "Shop order batch writers"
  on public.shop_order_batches for all to authenticated
  using (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering.review')
  )
  with check (
    private.has_page_access('workspace.restaurant.shop_order')
    or private.has_page_access('restaurant.ordering.review')
  );

create or replace function public.shop_create_order_batch(
  p_restaurant_id uuid,
  p_delivery_date date,
  p_note text,
  p_groups jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_batch_id uuid;
  v_request_id uuid;
  v_group jsonb;
  v_supplier_id uuid;
  v_line_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.has_page_access('workspace.restaurant.shop_order')
    and not private.has_page_access('restaurant.ordering') then
    raise exception 'shop_order_create_forbidden' using errcode = '42501';
  end if;
  if not private.has_page_access('restaurant.ordering') and not exists (
    select 1 from public.user_profiles profile
    where profile.id = auth.uid() and profile.shop_restro_id = p_restaurant_id
  ) then
    raise exception 'shop_order_restaurant_mismatch' using errcode = '42501';
  end if;
  if p_delivery_date < (timezone('Asia/Hong_Kong', now()))::date then
    raise exception 'delivery_date cannot be before today' using errcode = '22007';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array'
    or jsonb_array_length(p_groups) = 0 then
    raise exception 'shop_order_groups_required' using errcode = '22023';
  end if;

  if jsonb_array_length(p_groups) <> (
    select count(distinct concat_ws('|',
      value->>'channel', value->>'supplierId', value->>'supplierName'))
    from jsonb_array_elements(p_groups)
  ) then
    raise exception 'duplicate_shop_order_supplier' using errcode = '22023';
  end if;

  insert into public.shop_order_batches (
    restaurant_id, delivery_date, note, created_by
  ) values (
    p_restaurant_id, p_delivery_date, nullif(btrim(p_note), ''), auth.uid()
  ) returning id into v_batch_id;

  for v_group in select value from jsonb_array_elements(p_groups)
  loop
    v_supplier_id := nullif(v_group->>'supplierId', '')::uuid;
    if v_group->>'channel' not in ('external', 'fc_internal')
      or nullif(btrim(v_group->>'supplierName'), '') is null
      or coalesce(jsonb_typeof(v_group->'lines'), '') <> 'array'
      or jsonb_array_length(v_group->'lines') = 0 then
      raise exception 'invalid_shop_order_group' using errcode = '22023';
    end if;

    select count(*) into v_line_count
    from jsonb_array_elements(v_group->'lines');
    if v_line_count <> (
      select count(distinct value->>'catalogItemId')
      from jsonb_array_elements(v_group->'lines')
    ) or exists (
      select 1
      from jsonb_array_elements(v_group->'lines') line
      left join public.shop_catalog_items item
        on item.id = nullif(line.value->>'catalogItemId', '')::uuid
      where item.id is null
        or not item.is_active
        or item.channel <> v_group->>'channel'
        or item.supplier_name <> v_group->>'supplierName'
        or item.fcc_supplier_id is distinct from v_supplier_id
        or coalesce((line.value->>'quantity')::numeric, 0) <= 0
    ) then
      raise exception 'invalid_shop_order_lines' using errcode = '22023';
    end if;

    insert into public.shop_order_requests (
      order_batch_id, restaurant_id, channel, supplier_id,
      catalog_supplier_name, delivery_date, status, note,
      contact_id, contact_phone, created_by
    ) values (
      v_batch_id, p_restaurant_id, v_group->>'channel', v_supplier_id,
      v_group->>'supplierName', p_delivery_date,
      case when v_group->>'channel' = 'external' then 'saved' else 'submitted' end,
      nullif(btrim(p_note), ''),
      nullif(v_group->>'contactId', '')::uuid,
      nullif(v_group->>'contactPhone', ''), auth.uid()
    ) returning id into v_request_id;

    insert into public.shop_order_lines (
      request_id, catalog_item_id, sku, name, unit, quantity, warehouse
    )
    select
      v_request_id, item.id, item.sku, item.name, item.unit,
      (line.value->>'quantity')::numeric, item.warehouse
    from jsonb_array_elements(v_group->'lines') line
    join public.shop_catalog_items item
      on item.id = (line.value->>'catalogItemId')::uuid;

    insert into public.shop_order_events (request_id, event_type, payload, actor_id)
    values (
      v_request_id, 'order_created',
      jsonb_build_object('batchId', v_batch_id, 'lineCount', v_line_count),
      auth.uid()
    );
  end loop;

  return v_batch_id;
end;
$$;

grant select, insert, update on public.shop_order_batches to authenticated;
revoke all on function public.shop_create_order_batch(uuid, date, text, jsonb) from public;
grant execute on function public.shop_create_order_batch(uuid, date, text, jsonb) to authenticated;
