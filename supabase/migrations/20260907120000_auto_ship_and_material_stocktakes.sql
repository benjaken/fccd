-- Sending an approved FC-internal request is the shipment action. Dry-goods
-- movements also maintain transaction-after stocktake snapshots for materials.

alter table public.shop_catalog_items
  add column if not exists ingredient_id uuid references public.ingredients (id),
  add column if not exists stocktake_kind text,
  add column if not exists stocktake_quantity_per_unit numeric not null default 1;

alter table public.shop_catalog_items
  drop constraint if exists shop_catalog_items_stocktake_kind_check,
  add constraint shop_catalog_items_stocktake_kind_check
    check (stocktake_kind is null or stocktake_kind in ('ingredient', 'packing')),
  drop constraint if exists shop_catalog_items_stocktake_quantity_per_unit_check,
  add constraint shop_catalog_items_stocktake_quantity_per_unit_check
    check (stocktake_quantity_per_unit > 0);

create index if not exists shop_catalog_items_ingredient_id_idx
  on public.shop_catalog_items (ingredient_id);

-- The imported FC catalogue is ordered by business section: food is 16-65
-- and packaging is 66-83. Other sections are equipment/uniforms and stay out
-- of ingredient and packaging stocktakes.
update public.shop_catalog_items
set stocktake_kind = 'ingredient', updated_at = now()
where channel = 'fc_internal' and warehouse = 'dry' and sort_order between 16 and 65;

update public.shop_catalog_items
set stocktake_kind = 'packing', updated_at = now()
where channel = 'fc_internal'
  and warehouse = 'dry'
  and (sort_order between 66 and 83 or btrim(name) = '500ml 甜品杯');

-- Reuse an existing master only when the match is unique and of the right kind.
with candidates as (
  select catalog.id as catalog_id, min(ingredient.id::text)::uuid as ingredient_id
  from public.shop_catalog_items as catalog
  join public.ingredients as ingredient
    on (
      (nullif(btrim(catalog.sku), '') is not null and btrim(ingredient.sku) = btrim(catalog.sku))
      or lower(btrim(ingredient.name)) = lower(btrim(catalog.name))
    )
   and (
     (catalog.stocktake_kind = 'ingredient' and ingredient.is_ingredient_stocktake is true)
     or (catalog.stocktake_kind = 'packing' and ingredient.is_packing_stocktake is true)
   )
  where catalog.stocktake_kind is not null
  group by catalog.id
  having count(*) = 1
)
update public.shop_catalog_items as catalog
set ingredient_id = candidates.ingredient_id, updated_at = now()
from candidates
where catalog.id = candidates.catalog_id and catalog.ingredient_id is null;

create or replace function public.shop_ensure_catalog_ingredient(p_catalog_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_catalog public.shop_catalog_items%rowtype;
  v_ingredient_id uuid;
begin
  select * into v_catalog
  from public.shop_catalog_items
  where id = p_catalog_item_id
  for update;

  if not found
    or v_catalog.channel <> 'fc_internal'
    or v_catalog.stocktake_kind is null then return null; end if;
  if v_catalog.ingredient_id is not null then return v_catalog.ingredient_id; end if;

  select min(id::text)::uuid into v_ingredient_id
  from public.ingredients
  where (
      (nullif(btrim(v_catalog.sku), '') is not null and btrim(sku) = btrim(v_catalog.sku))
      or lower(btrim(name)) = lower(btrim(v_catalog.name))
    )
    and ((v_catalog.stocktake_kind = 'ingredient' and is_ingredient_stocktake is true)
      or (v_catalog.stocktake_kind = 'packing' and is_packing_stocktake is true))
  having count(*) = 1;

  if v_ingredient_id is null then
    insert into public.ingredients (
      legacy_id, supplier_id, sku, name, ingredient_type, product_unit,
      stocktake_unit, product_quantity, is_ingredient_stocktake,
      is_packing_stocktake, is_active, bubble_created_at, bubble_modified_at
    ) values (
      'shop-catalog:' || v_catalog.id::text,
      v_catalog.fcc_supplier_id,
      nullif(btrim(v_catalog.sku), ''),
      v_catalog.name,
      case when v_catalog.stocktake_kind = 'packing' then '包裝用品' else '食材' end,
      coalesce(nullif(btrim(v_catalog.unit), ''), '件'),
      coalesce(nullif(btrim(v_catalog.unit), ''), '件'),
      1,
      v_catalog.stocktake_kind = 'ingredient',
      v_catalog.stocktake_kind = 'packing',
      true,
      now(),
      now()
    )
    on conflict (legacy_id) do update set updated_at = now()
    returning id into v_ingredient_id;
  end if;

  update public.shop_catalog_items
  set ingredient_id = v_ingredient_id, updated_at = now()
  where id = p_catalog_item_id;
  return v_ingredient_id;
end;
$$;

create or replace function public.shop_sync_material_stocktake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_catalog public.shop_catalog_items%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_balance numeric;
  v_legacy_id text;
begin
  if new.catalog_item_id is null then return new; end if;
  perform public.shop_ensure_catalog_ingredient(new.catalog_item_id);

  select * into v_catalog from public.shop_catalog_items where id = new.catalog_item_id;
  if v_catalog.channel <> 'fc_internal'
    or v_catalog.stocktake_kind is null
    or v_catalog.ingredient_id is null then return new; end if;
  select * into v_ingredient from public.ingredients where id = v_catalog.ingredient_id;

  select coalesce(sum(
    case when movement.movement_type = 'inbound' then movement.quantity else -movement.quantity end
    * catalog.stocktake_quantity_per_unit
  ), 0)
  into v_balance
  from public.shop_dry_stock_movements as movement
  join public.shop_catalog_items as catalog on catalog.id = movement.catalog_item_id
  where catalog.ingredient_id = v_catalog.ingredient_id;

  v_legacy_id := 'shop-auto-' || v_catalog.stocktake_kind || '-stocktake:'
    || new.source_type || ':' || new.source_id::text;

  if v_catalog.stocktake_kind = 'ingredient' then
    insert into public.ingredient_stocktake_events (
      legacy_id, ingredient_id, ingredient_legacy_id, stocktake_at, quantity,
      sku_snapshot, bubble_created_at, bubble_modified_at
    ) values (
      v_legacy_id, v_ingredient.id, v_ingredient.legacy_id, new.occurred_at,
      v_balance, coalesce(new.sku, v_ingredient.sku), new.occurred_at, new.occurred_at
    ) on conflict (legacy_id) do nothing;
  else
    insert into public.packing_stocktake_events (
      legacy_id, ingredient_id, ingredient_legacy_id, stocktake_at, quantity,
      sku_snapshot, bubble_created_at, bubble_modified_at
    ) values (
      v_legacy_id, v_ingredient.id, v_ingredient.legacy_id, new.occurred_at,
      v_balance, coalesce(new.sku, v_ingredient.sku), new.occurred_at, new.occurred_at
    ) on conflict (legacy_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists shop_dry_stock_movements_sync_stocktake
  on public.shop_dry_stock_movements;
create trigger shop_dry_stock_movements_sync_stocktake
after insert on public.shop_dry_stock_movements
for each row execute function public.shop_sync_material_stocktake();

-- Anyone allowed to send an order must also be able to execute the existing
-- warehouse shipment RPC and view the shipment it creates.
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select sender.role, target.page_key, true, sender.can_manage
from public.role_page_permissions as sender
cross join (values
  ('restaurant'), ('restaurant.ordering'),
  ('workspace.factory.warehouse'), ('workspace.factory.warehouse.outbound')
) as target(page_key)
where sender.page_key = 'restaurant.ordering.review.send_factory'
  and sender.can_access is true
on conflict (role, page_key) do update set
  can_access = true,
  can_manage = public.role_page_permissions.can_manage or excluded.can_manage,
  updated_at = now();

create or replace function public.shop_send_reviewed_order_to_factory(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.shop_order_requests%rowtype;
  v_lines jsonb;
begin
  if auth.uid() is null
    or not private.has_page_access('restaurant.ordering.review.send_factory') then
    raise exception 'shop_order_send_forbidden' using errcode = '42501';
  end if;

  select * into v_request from public.shop_order_requests
  where id = p_request_id for update;
  if not found then raise exception 'shop_order_not_found' using errcode = 'P0002'; end if;
  if v_request.channel <> 'fc_internal' or v_request.status <> 'reviewed' then
    raise exception 'shop_order_not_approved' using errcode = '55000';
  end if;

  select jsonb_agg(jsonb_build_object(
    'request_line_id', line.id,
    'quantity', line.quantity
  ) order by line.created_at)
  into v_lines
  from public.shop_order_lines as line
  where line.request_id = p_request_id;

  if v_lines is null then raise exception 'shop_order_has_no_lines' using errcode = '55000'; end if;

  update public.shop_order_requests set status = 'sent_to_factory' where id = p_request_id;
  insert into public.shop_order_events (request_id, event_type, payload, actor_id)
  values (p_request_id, 'sent_to_factory', '{}'::jsonb, auth.uid());

  perform public.ship_shop_order_request(p_request_id, v_lines);
end;
$$;

update public.app_pages
set route = '/restaurant/ordering/inventory', sort_order = 79, updated_at = now()
where page_key = 'workspace.factory.warehouse.outbound';

delete from public.role_page_permissions
where page_key = 'workspace.factory.warehouse.pending';
delete from public.app_pages
where page_key = 'workspace.factory.warehouse.pending';

revoke all on function public.shop_ensure_catalog_ingredient(uuid) from public;
revoke all on function public.shop_sync_material_stocktake() from public;
grant execute on function public.shop_ensure_catalog_ingredient(uuid) to authenticated;
