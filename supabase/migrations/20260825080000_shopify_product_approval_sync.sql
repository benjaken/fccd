-- Shopify catalog intake, review, approval, and daily reconciliation.
-- Webhooks and sync jobs write staging tables only. Formal catalog rows are
-- changed exclusively through approve_shopify_pending_catalog_item().

begin;

-- pg_cron and pg_net are managed by the Supabase project and are already
-- enabled. Re-running CREATE EXTENSION through the Management API triggers
-- hosted-platform grant hooks, so this migration only consumes them.

-- shopify_stores already exists in deployed environments used by the order
-- synchronizer. Keep a compatible definition here so a clean migration chain
-- can also provision the catalog integration.
create table if not exists public.shopify_stores (
  id uuid primary key default gen_random_uuid(),
  shop_domain text not null unique,
  channel_id uuid references public.channels(id),
  secret_prefix text not null unique,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopify_catalog_webhook_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.shopify_stores(id) on delete cascade,
  webhook_id text not null,
  event_id text,
  topic text not null check (topic in ('products/create', 'products/update', 'products/delete')),
  shopify_product_id bigint,
  api_version text,
  triggered_at timestamptz,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  next_attempt_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, webhook_id)
);
create index shopify_catalog_webhook_events_retry_idx
  on public.shopify_catalog_webhook_events(status, next_attempt_at, created_at)
  where status in ('queued', 'failed');

create table public.shopify_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.shopify_stores(id) on delete cascade,
  mode text not null check (mode in ('full', 'incremental', 'specific_product', 'retry_failed', 'webhook')),
  source text not null default 'manual' check (source in ('manual', 'webhook', 'reconciliation')),
  requested_product_id bigint,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed')),
  cursor text,
  total_fetched integer not null default 0,
  product_count integer not null default 0,
  package_count integer not null default 0,
  matched_count integer not null default 0,
  pending_count integer not null default 0,
  conflict_count integer not null default 0,
  failed_count integer not null default 0,
  requested_by uuid references auth.users(id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopify_catalog_sync_runs_store_created_idx
  on public.shopify_catalog_sync_runs(store_id, created_at desc);

create table public.shopify_catalog_sync_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.shopify_catalog_sync_runs(id) on delete cascade,
  store_id uuid references public.shopify_stores(id) on delete cascade,
  shopify_product_id bigint,
  code text not null,
  message text,
  retryable boolean not null default true,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index shopify_catalog_sync_errors_run_idx
  on public.shopify_catalog_sync_errors(run_id, created_at);

create table public.shopify_catalog_sync_checkpoints (
  store_id uuid primary key references public.shopify_stores(id) on delete cascade,
  last_successful_synced_at timestamptz,
  last_cursor text,
  last_full_sync_at timestamptz,
  last_webhook_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.shopify_catalog_drafts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.shopify_stores(id) on delete cascade,
  shopify_product_id bigint not null,
  title text not null,
  handle text,
  description_html text,
  vendor text,
  product_type text,
  catalog_type text not null default 'product'
    check (catalog_type in ('product', 'fixed_package', 'configurable_package', 'unknown')),
  shopify_status text,
  tags text[] not null default '{}',
  featured_image_url text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  source_topic text,
  source_run_id uuid references public.shopify_catalog_sync_runs(id) on delete set null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'change_pending', 'dependency_pending', 'conflict', 'approved', 'rejected', 'deleted')),
  content_fingerprint text not null,
  approved_fingerprint text,
  approved_snapshot jsonb,
  raw_snapshot jsonb not null,
  normalized_snapshot jsonb not null,
  change_diff jsonb not null default '{}'::jsonb,
  blocking_reasons text[] not null default '{}',
  last_error text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, shopify_product_id)
);
create index shopify_catalog_drafts_queue_idx
  on public.shopify_catalog_drafts(approval_status, updated_at desc);
create index shopify_catalog_drafts_store_idx
  on public.shopify_catalog_drafts(store_id, updated_at desc);

create table public.shopify_catalog_draft_variants (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.shopify_catalog_drafts(id) on delete cascade,
  shopify_variant_id bigint not null,
  title text,
  sku text,
  barcode text,
  price numeric(14,2),
  compare_at_price numeric(14,2),
  option_values jsonb not null default '{}'::jsonb,
  image_url text,
  requires_components boolean not null default false,
  matched_product_id uuid references public.products(id),
  match_status text not null default 'unmatched'
    check (match_status in ('mapped', 'sku_matched', 'unmatched', 'missing_sku', 'duplicate_sku')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, shopify_variant_id)
);
create index shopify_catalog_draft_variants_sku_idx
  on public.shopify_catalog_draft_variants(sku) where sku is not null;

create table public.shopify_catalog_draft_choice_sets (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.shopify_catalog_drafts(id) on delete cascade,
  external_key text not null,
  name text not null,
  minimum_choices numeric(14,3),
  maximum_choices numeric(14,3) not null check (maximum_choices > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (draft_id, external_key)
);

create table public.shopify_catalog_draft_package_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.shopify_catalog_drafts(id) on delete cascade,
  choice_set_id uuid references public.shopify_catalog_draft_choice_sets(id) on delete cascade,
  external_key text not null,
  parent_variant_id bigint,
  child_shopify_product_id bigint,
  child_shopify_variant_id bigint,
  sku text,
  name text not null,
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  addon_price numeric(14,2) not null default 0,
  is_required boolean not null default false,
  is_default boolean not null default false,
  matched_product_id uuid references public.products(id),
  match_status text not null default 'unmatched'
    check (match_status in ('mapped', 'sku_matched', 'unmatched', 'missing_sku', 'duplicate_sku')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, external_key)
);
create index shopify_catalog_draft_package_items_draft_idx
  on public.shopify_catalog_draft_package_items(draft_id, choice_set_id);

create table public.shopify_catalog_mappings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.shopify_stores(id) on delete cascade,
  resource_type text not null check (resource_type in ('product_variant', 'package')),
  shopify_product_id bigint not null,
  shopify_variant_id bigint,
  internal_product_id uuid references public.products(id),
  internal_package_id uuid references public.packages(id),
  approved_fingerprint text,
  last_shopify_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (resource_type = 'product_variant' and shopify_variant_id is not null and internal_product_id is not null and internal_package_id is null)
    or
    (resource_type = 'package' and internal_package_id is not null and internal_product_id is null)
  )
);
create unique index shopify_catalog_mappings_source_uidx
  on public.shopify_catalog_mappings(
    store_id,
    resource_type,
    shopify_product_id,
    coalesce(shopify_variant_id, 0)
  );
create unique index shopify_catalog_mappings_product_target_uidx
  on public.shopify_catalog_mappings(store_id, internal_product_id)
  where internal_product_id is not null and is_active;
create unique index shopify_catalog_mappings_package_target_uidx
  on public.shopify_catalog_mappings(store_id, internal_package_id)
  where internal_package_id is not null and is_active;

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk, parent_page_key, page_kind
)
values (
  'products.shopify_pending', 'Shopify待審商品', '/products/shopify-pending',
  45, false, 'products', 'subpage'
)
on conflict (page_key) do update set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
         ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
)
insert into public.role_page_permissions(role, page_key, can_access, can_manage)
select
  roles.role,
  'products.shopify_pending',
  case when roles.role = 'Super Admin' then true else coalesce(parent.can_access, false) end,
  case when roles.role = 'Super Admin' then true else coalesce(parent.can_manage, false) end
from roles
left join public.role_page_permissions parent
  on parent.role = roles.role and parent.page_key = 'products'
on conflict (role, page_key) do update set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();

alter table public.shopify_catalog_webhook_events enable row level security;
alter table public.shopify_stores enable row level security;
alter table public.shopify_catalog_sync_runs enable row level security;
alter table public.shopify_catalog_sync_errors enable row level security;
alter table public.shopify_catalog_sync_checkpoints enable row level security;
alter table public.shopify_catalog_drafts enable row level security;
alter table public.shopify_catalog_draft_variants enable row level security;
alter table public.shopify_catalog_draft_choice_sets enable row level security;
alter table public.shopify_catalog_draft_package_items enable row level security;
alter table public.shopify_catalog_mappings enable row level security;

revoke select on public.shopify_stores from authenticated;
grant select(id, shop_domain, channel_id, is_active) on public.shopify_stores to authenticated;
grant select on public.shopify_catalog_sync_runs, public.shopify_catalog_sync_errors,
  public.shopify_catalog_drafts, public.shopify_catalog_draft_variants,
  public.shopify_catalog_draft_choice_sets, public.shopify_catalog_draft_package_items,
  public.shopify_catalog_mappings to authenticated;

create policy "Shopify catalog reviewers read stores"
  on public.shopify_stores for select to authenticated
  using (
    private.has_page_access('products.shopify_pending')
    or private.has_page_access('orders')
    or private.has_page_access('orders.shopify_pending')
  );
create policy "Shopify catalog reviewers read runs"
  on public.shopify_catalog_sync_runs for select to authenticated
  using (private.has_page_access('products.shopify_pending'));
create policy "Shopify catalog reviewers read errors"
  on public.shopify_catalog_sync_errors for select to authenticated
  using (private.has_page_access('products.shopify_pending'));
create policy "Shopify catalog reviewers read drafts"
  on public.shopify_catalog_drafts for select to authenticated
  using (private.has_page_access('products.shopify_pending'));
create policy "Shopify catalog reviewers read variants"
  on public.shopify_catalog_draft_variants for select to authenticated
  using (private.has_page_access('products.shopify_pending'));
create policy "Shopify catalog reviewers read choice sets"
  on public.shopify_catalog_draft_choice_sets for select to authenticated
  using (private.has_page_access('products.shopify_pending'));
create policy "Shopify catalog reviewers read package items"
  on public.shopify_catalog_draft_package_items for select to authenticated
  using (private.has_page_access('products.shopify_pending'));
create policy "Shopify catalog reviewers read mappings"
  on public.shopify_catalog_mappings for select to authenticated
  using (private.has_page_access('products.shopify_pending'));

create or replace function public.approve_shopify_pending_catalog_item(
  p_draft_id uuid,
  p_expected_updated_at timestamptz,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.shopify_catalog_drafts%rowtype;
  v_store public.shopify_stores%rowtype;
  v_variant public.shopify_catalog_draft_variants%rowtype;
  v_item public.shopify_catalog_draft_package_items%rowtype;
  v_group public.shopify_catalog_draft_choice_sets%rowtype;
  v_product_id uuid;
  v_package_id uuid;
  v_package_legacy_id text;
  v_choice_legacy_id text;
  v_first_variant public.shopify_catalog_draft_variants%rowtype;
  v_product_legacy_id text;
  v_created_products integer := 0;
begin
  if not private.has_page_manage('products.shopify_pending') then
    raise exception 'shopify_catalog_manage_required' using errcode = '42501';
  end if;

  select * into v_draft
  from public.shopify_catalog_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'shopify_catalog_draft_not_found' using errcode = 'P0002';
  end if;
  if v_draft.approval_status not in ('pending', 'change_pending') then
    raise exception 'shopify_catalog_draft_not_approvable' using errcode = '22023';
  end if;
  if v_draft.updated_at is distinct from p_expected_updated_at then
    raise exception 'shopify_catalog_draft_changed' using errcode = '40001';
  end if;
  if cardinality(v_draft.blocking_reasons) > 0 then
    raise exception 'shopify_catalog_draft_blocked' using errcode = '22023';
  end if;

  select * into v_store from public.shopify_stores where id = v_draft.store_id;

  if v_draft.catalog_type = 'product' then
    if not exists (
      select 1 from public.shopify_catalog_draft_variants where draft_id = v_draft.id
    ) then
      raise exception 'shopify_catalog_variants_required' using errcode = '22023';
    end if;

    for v_variant in
      select * from public.shopify_catalog_draft_variants
      where draft_id = v_draft.id order by shopify_variant_id
    loop
      if v_variant.match_status in ('missing_sku', 'duplicate_sku') then
        raise exception 'shopify_catalog_variant_blocked' using errcode = '22023';
      end if;

      select internal_product_id into v_product_id
      from public.shopify_catalog_mappings
      where store_id = v_draft.store_id
        and resource_type = 'product_variant'
        and shopify_product_id = v_draft.shopify_product_id
        and shopify_variant_id = v_variant.shopify_variant_id
        and is_active;
      v_product_id := coalesce(v_product_id, v_variant.matched_product_id);

      if v_product_id is null then
        v_product_legacy_id := format(
          'shopify:product:%s:%s', replace(v_store.shop_domain, '.myshopify.com', ''),
          v_variant.shopify_variant_id
        );
        insert into public.products(
          legacy_id, channel_id, sku, name, description, image_url, price,
          status, is_active, created_at, updated_at
        ) values (
          v_product_legacy_id, v_store.channel_id, nullif(btrim(v_variant.sku), ''),
          case when coalesce(v_variant.title, '') in ('', 'Default Title')
            then v_draft.title else v_draft.title || ' / ' || v_variant.title end,
          v_draft.description_html, coalesce(v_variant.image_url, v_draft.featured_image_url),
          v_variant.price, null, coalesce(v_draft.shopify_status = 'active', true), now(), now()
        ) returning id into v_product_id;
        v_created_products := v_created_products + 1;
      else
        update public.products set
          sku = coalesce(nullif(btrim(v_variant.sku), ''), sku),
          name = case when coalesce(v_variant.title, '') in ('', 'Default Title')
            then v_draft.title else v_draft.title || ' / ' || v_variant.title end,
          description = v_draft.description_html,
          image_url = coalesce(v_variant.image_url, v_draft.featured_image_url),
          price = v_variant.price,
          is_active = coalesce(v_draft.shopify_status = 'active', is_active),
          updated_at = now()
        where id = v_product_id;
      end if;

      insert into public.shopify_catalog_mappings(
        store_id, resource_type, shopify_product_id, shopify_variant_id,
        internal_product_id, approved_fingerprint, last_shopify_updated_at,
        last_synced_at, is_active
      ) values (
        v_draft.store_id, 'product_variant', v_draft.shopify_product_id,
        v_variant.shopify_variant_id, v_product_id, v_draft.content_fingerprint,
        v_draft.source_updated_at, now(), true
      )
      on conflict (
        store_id, resource_type, shopify_product_id,
        (coalesce(shopify_variant_id, 0))
      ) do update set
        internal_product_id = excluded.internal_product_id,
        approved_fingerprint = excluded.approved_fingerprint,
        last_shopify_updated_at = excluded.last_shopify_updated_at,
        last_synced_at = now(), is_active = true, updated_at = now();
    end loop;
  elsif v_draft.catalog_type in ('fixed_package', 'configurable_package') then
    if exists (
      select 1 from public.shopify_catalog_draft_package_items
      where draft_id = v_draft.id
        and (matched_product_id is null or match_status not in ('mapped', 'sku_matched'))
    ) then
      raise exception 'shopify_catalog_package_dependencies_incomplete' using errcode = '22023';
    end if;
    if v_draft.catalog_type = 'configurable_package' and not exists (
      select 1 from public.shopify_catalog_draft_choice_sets where draft_id = v_draft.id
    ) then
      raise exception 'shopify_catalog_choice_sets_required' using errcode = '22023';
    end if;

    select * into v_first_variant
    from public.shopify_catalog_draft_variants
    where draft_id = v_draft.id order by shopify_variant_id limit 1;

    select internal_package_id into v_package_id
    from public.shopify_catalog_mappings
    where store_id = v_draft.store_id and resource_type = 'package'
      and shopify_product_id = v_draft.shopify_product_id and is_active;

    v_package_legacy_id := format(
      'shopify:package:%s:%s', replace(v_store.shop_domain, '.myshopify.com', ''),
      v_draft.shopify_product_id
    );
    if v_package_id is null then
      insert into public.packages(
        legacy_id, channel_id, sku, name, description, price, status,
        is_active, created_at, updated_at
      ) values (
        v_package_legacy_id, v_store.channel_id, nullif(btrim(v_first_variant.sku), ''),
        v_draft.title, v_draft.description_html, v_first_variant.price, null,
        coalesce(v_draft.shopify_status = 'active', true), now(), now()
      ) returning id into v_package_id;
    else
      update public.packages set
        sku = coalesce(nullif(btrim(v_first_variant.sku), ''), sku),
        name = v_draft.title, description = v_draft.description_html,
        price = v_first_variant.price,
        is_active = coalesce(v_draft.shopify_status = 'active', is_active),
        updated_at = now()
      where id = v_package_id;
    end if;

    for v_group in
      select * from public.shopify_catalog_draft_choice_sets
      where draft_id = v_draft.id order by sort_order, id
    loop
      if v_group.maximum_choices > (
        select count(*) from public.shopify_catalog_draft_package_items
        where choice_set_id = v_group.id
      ) then
        raise exception 'shopify_catalog_choice_limit_invalid' using errcode = '22023';
      end if;
      v_choice_legacy_id := format('%s:choice:%s', v_package_legacy_id, v_group.external_key);
      insert into public.package_choice_sets(
        legacy_id, package_id, package_legacy_id, choice_type,
        maximum_choices, created_at
      ) values (
        v_choice_legacy_id, v_package_id, v_package_legacy_id,
        v_group.name, v_group.maximum_choices, now()
      )
      on conflict (legacy_id) do update set
        choice_type = excluded.choice_type,
        maximum_choices = excluded.maximum_choices;
    end loop;

    for v_item in
      select * from public.shopify_catalog_draft_package_items
      where draft_id = v_draft.id order by created_at, id
    loop
      select legacy_id into v_product_legacy_id
      from public.products where id = v_item.matched_product_id;
      select format('%s:choice:%s', v_package_legacy_id, choice.external_key)
        into v_choice_legacy_id
      from public.shopify_catalog_draft_choice_sets choice
      where choice.id = v_item.choice_set_id;
      insert into public.package_products(
        legacy_id, package_id, package_legacy_id, product_id,
        product_legacy_id, quantity, addon_price, is_selected,
        package_choice_set_legacy_id, created_at, updated_at
      ) values (
        format('%s:item:%s', v_package_legacy_id, v_item.external_key),
        v_package_id, v_package_legacy_id, v_item.matched_product_id,
        v_product_legacy_id, v_item.quantity, v_item.addon_price,
        v_item.is_required or v_item.is_default, v_choice_legacy_id, now(), now()
      )
      on conflict (legacy_id) do update set
        product_id = excluded.product_id,
        product_legacy_id = excluded.product_legacy_id,
        quantity = excluded.quantity,
        addon_price = excluded.addon_price,
        is_selected = excluded.is_selected,
        package_choice_set_legacy_id = excluded.package_choice_set_legacy_id,
        updated_at = now();
    end loop;

    insert into public.shopify_catalog_mappings(
      store_id, resource_type, shopify_product_id, internal_package_id,
      approved_fingerprint, last_shopify_updated_at, last_synced_at, is_active
    ) values (
      v_draft.store_id, 'package', v_draft.shopify_product_id, v_package_id,
      v_draft.content_fingerprint, v_draft.source_updated_at, now(), true
    )
    on conflict (
      store_id, resource_type, shopify_product_id,
      (coalesce(shopify_variant_id, 0))
    ) do update set
      internal_package_id = excluded.internal_package_id,
      approved_fingerprint = excluded.approved_fingerprint,
      last_shopify_updated_at = excluded.last_shopify_updated_at,
      last_synced_at = now(), is_active = true, updated_at = now();
  else
    raise exception 'shopify_catalog_type_unknown' using errcode = '22023';
  end if;

  update public.shopify_catalog_drafts set
    approval_status = 'approved',
    approved_fingerprint = content_fingerprint,
    approved_snapshot = normalized_snapshot,
    change_diff = '{}'::jsonb,
    reviewed_by = (select auth.uid()),
    reviewed_at = now(),
    review_note = nullif(btrim(p_review_note), ''),
    updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object(
    'draftId', v_draft.id,
    'catalogType', v_draft.catalog_type,
    'productIdsCreated', v_created_products,
    'packageId', v_package_id,
    'status', 'approved'
  );
end;
$$;

revoke all on function public.approve_shopify_pending_catalog_item(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.approve_shopify_pending_catalog_item(uuid, timestamptz, text)
  to authenticated;

create or replace function public.resolve_shopify_catalog_match(
  p_draft_id uuid,
  p_variant_row_id uuid,
  p_package_item_row_id uuid,
  p_product_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.shopify_catalog_drafts%rowtype;
  v_reasons text[];
  v_new_status text;
  v_updated_at timestamptz := now();
begin
  if not private.has_page_manage('products.shopify_pending') then
    raise exception 'shopify_catalog_manage_required' using errcode = '42501';
  end if;
  if (case when p_variant_row_id is null then 0 else 1 end) +
     (case when p_package_item_row_id is null then 0 else 1 end) <> 1 then
    raise exception 'shopify_catalog_match_target_required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.products
    where id = p_product_id and archived_at is null and is_active
  ) then
    raise exception 'shopify_catalog_match_product_invalid' using errcode = '22023';
  end if;

  select * into v_draft from public.shopify_catalog_drafts
  where id = p_draft_id for update;
  if not found then
    raise exception 'shopify_catalog_draft_not_found' using errcode = 'P0002';
  end if;
  if v_draft.updated_at is distinct from p_expected_updated_at then
    raise exception 'shopify_catalog_draft_changed' using errcode = '40001';
  end if;
  if v_draft.approval_status in ('approved', 'rejected', 'deleted') then
    raise exception 'shopify_catalog_draft_not_editable' using errcode = '22023';
  end if;

  if p_variant_row_id is not null then
    update public.shopify_catalog_draft_variants set
      matched_product_id = p_product_id,
      match_status = 'mapped',
      updated_at = v_updated_at
    where id = p_variant_row_id and draft_id = p_draft_id;
  else
    update public.shopify_catalog_draft_package_items set
      matched_product_id = p_product_id,
      match_status = 'mapped',
      updated_at = v_updated_at
    where id = p_package_item_row_id and draft_id = p_draft_id;
  end if;
  if not found then
    raise exception 'shopify_catalog_match_target_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct reason), '{}') into v_reasons
  from (
    select match_status as reason
    from public.shopify_catalog_draft_variants
    where draft_id = p_draft_id and match_status in ('missing_sku', 'duplicate_sku')
    union all
    select 'package_item_' || match_status
    from public.shopify_catalog_draft_package_items
    where draft_id = p_draft_id
      and (matched_product_id is null or match_status not in ('mapped', 'sku_matched'))
  ) unresolved;

  v_new_status := case
    when cardinality(v_reasons) > 0 and v_draft.catalog_type = 'product' then 'conflict'
    when cardinality(v_reasons) > 0 then 'dependency_pending'
    when v_draft.approved_fingerprint is not null then 'change_pending'
    else 'pending'
  end;
  update public.shopify_catalog_drafts set
    blocking_reasons = v_reasons,
    approval_status = v_new_status,
    updated_at = v_updated_at
  where id = p_draft_id;

  return jsonb_build_object('status', v_new_status, 'updatedAt', v_updated_at);
end;
$$;

create or replace function public.reject_shopify_pending_catalog_item(
  p_draft_id uuid,
  p_expected_updated_at timestamptz,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.has_page_manage('products.shopify_pending') then
    raise exception 'shopify_catalog_manage_required' using errcode = '42501';
  end if;
  update public.shopify_catalog_drafts set
    approval_status = 'rejected', reviewed_by = (select auth.uid()),
    reviewed_at = now(), review_note = nullif(btrim(p_review_note), ''),
    updated_at = now()
  where id = p_draft_id
    and updated_at = p_expected_updated_at
    and approval_status in ('pending', 'change_pending', 'dependency_pending', 'conflict')
  returning approval_status into v_status;
  if not found then
    raise exception 'shopify_catalog_draft_changed_or_not_rejectable' using errcode = '40001';
  end if;
  return jsonb_build_object('status', v_status);
end;
$$;

revoke all on function public.resolve_shopify_catalog_match(uuid, uuid, uuid, uuid, timestamptz)
  from public, anon;
revoke all on function public.reject_shopify_pending_catalog_item(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.resolve_shopify_catalog_match(uuid, uuid, uuid, uuid, timestamptz)
  to authenticated;
grant execute on function public.reject_shopify_pending_catalog_item(uuid, timestamptz, text)
  to authenticated;

-- One reconciliation per day. pg_cron is UTC; 19:00 UTC is 03:00 Hong Kong.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fccd-shopify-catalog-daily-reconciliation';

select cron.schedule(
  'fccd-shopify-catalog-daily-reconciliation',
  '0 19 * * *',
  $$
    select net.http_post(
      url := 'https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/shopify-product-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_qeDZR6JWuYQaWSasETsOUg_vSJ07x4X',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'bubble_daily_cron_secret' limit 1
        )
      ),
      body := '{"mode":"incremental","source":"reconciliation"}'::jsonb,
      timeout_milliseconds := 90000
    );
  $$
);

commit;
