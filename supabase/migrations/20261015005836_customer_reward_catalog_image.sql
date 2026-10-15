alter table public.customer_reward_catalog
  add column if not exists image_object_path text;

alter table public.customer_reward_catalog
  drop constraint if exists customer_reward_catalog_image_object_path_check;

alter table public.customer_reward_catalog
  add constraint customer_reward_catalog_image_object_path_check
  check (
    image_object_path is null
    or image_object_path ~ '^[0-9a-f-]{36}/([0-9a-f-]{36}|ai/[0-9a-f-]{36})\.(jpg|jpeg|png|webp)$'
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-reward-catalog',
  'customer-reward-catalog',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

create or replace function private.customer_reward_catalog_image_path_ok(p_path text)
returns boolean language plpgsql stable security definer set search_path=public, pg_temp as $$
declare v_parts text[] := string_to_array(coalesce(p_path, ''), '/');
begin
  if p_path is null or btrim(p_path) = '' then return false; end if;
  if array_length(v_parts, 1) = 2 then
    return v_parts[1] ~ '^[0-9a-f-]{36}$'
      and lower(v_parts[2]) ~ '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$';
  end if;
  if array_length(v_parts, 1) = 3 then
    return v_parts[1] ~ '^[0-9a-f-]{36}$'
      and v_parts[2] = 'ai'
      and lower(v_parts[3]) ~ '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$';
  end if;
  return false;
end $$;
revoke all on function private.customer_reward_catalog_image_path_ok(text) from public, anon, authenticated;

create or replace function private.customer_reward_catalog_image_write_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public, private, pg_temp as $$
declare v_parts text[] := string_to_array(coalesce(p_path, ''), '/');
begin
  if not private.customer_reward_catalog_image_path_ok(p_path) then return false; end if;
  if v_parts[1] is distinct from auth.uid()::text then return false; end if;
  return private.has_page_access('settings.customer_portal.edit')
    or private.has_page_manage('settings.customer_portal');
end $$;
revoke all on function private.customer_reward_catalog_image_write_allowed(text) from public, anon;
grant execute on function private.customer_reward_catalog_image_write_allowed(text) to authenticated;

create or replace function private.customer_reward_catalog_image_read_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public, private, pg_temp as $$
begin
  if not private.customer_reward_catalog_image_path_ok(p_path) then return false; end if;
  if auth.uid() is null then return false; end if;
  return private.has_page_access('settings.customer_portal')
    or private.has_page_manage('settings.customer_portal')
    or exists (
      select 1 from public.customer_reward_catalog
      where image_object_path = p_path and is_active
    )
    or split_part(p_path, '/', 1) = auth.uid()::text;
end $$;
revoke all on function private.customer_reward_catalog_image_read_allowed(text) from public, anon;
grant execute on function private.customer_reward_catalog_image_read_allowed(text) to authenticated;

drop policy if exists "Reward catalog image inserts" on storage.objects;
drop policy if exists "Reward catalog image updates" on storage.objects;
drop policy if exists "Reward catalog image deletes" on storage.objects;
drop policy if exists "Reward catalog image reads" on storage.objects;

create policy "Reward catalog image inserts" on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-reward-catalog' and private.customer_reward_catalog_image_write_allowed(name));
create policy "Reward catalog image updates" on storage.objects for update to authenticated
  using (bucket_id = 'customer-reward-catalog' and private.customer_reward_catalog_image_write_allowed(name))
  with check (bucket_id = 'customer-reward-catalog' and private.customer_reward_catalog_image_write_allowed(name));
create policy "Reward catalog image deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'customer-reward-catalog' and private.customer_reward_catalog_image_write_allowed(name));
create policy "Reward catalog image reads" on storage.objects for select to authenticated
  using (bucket_id = 'customer-reward-catalog' and private.customer_reward_catalog_image_read_allowed(name));

create or replace function public.customer_reward_catalog()
returns jsonb language plpgsql stable security definer set search_path=public, private, pg_temp as $$
begin
  perform private.customer_personal_user();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'kind', kind, 'points_cost', points_cost, 'description', description, 'stock', stock,
    'voucher_amount_hkd', voucher_amount_hkd, 'image_object_path', image_object_path
  ) order by points_cost, name) from customer_reward_catalog where is_active), '[]');
end $$;

drop function if exists public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean, numeric, uuid, integer);
create function public.customer_portal_ops_upsert_reward_catalog(
  p_id uuid, p_name text, p_kind text, p_points bigint, p_description text, p_stock integer, p_active boolean,
  p_voucher_amount numeric default null, p_store_id uuid default null, p_valid_days integer default 365,
  p_image_object_path text default null
) returns uuid language plpgsql security definer set search_path=public, private, pg_temp as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text := btrim(coalesce(p_name, ''));
  v_amount numeric(14,2) := p_voucher_amount;
  v_store uuid := p_store_id;
  v_days integer := coalesce(p_valid_days, 365);
  v_image text := nullif(btrim(coalesce(p_image_object_path, '')), '');
begin
  perform private.customer_portal_ops_require(true);
  if p_kind = 'gift' then v_amount := null; v_store := null; end if;
  if v_name = '' or p_kind not in ('gift', 'voucher') or p_points is null or p_points < 1 or p_stock is null or p_stock < 0 or p_active is null
    or v_days < 1 or (p_kind = 'voucher' and ((v_amount is null) <> (v_store is null) or (v_amount is not null and v_amount <= 0))) then
    raise exception 'invalid_catalog_item' using errcode = 'P0001';
  end if;
  if v_store is not null and not exists (select 1 from shopify_stores where id = v_store and is_active) then
    raise exception 'invalid_catalog_item' using errcode = 'P0001';
  end if;
  if v_image is not null then
    if not private.customer_reward_catalog_image_path_ok(v_image)
      or not exists (select 1 from storage.objects where bucket_id = 'customer-reward-catalog' and name = v_image) then
      raise exception 'invalid_catalog_item' using errcode = 'P0001';
    end if;
  end if;
  insert into customer_reward_catalog(
    id, name, kind, points_cost, description, stock, is_active,
    voucher_amount_hkd, shopify_store_id, voucher_valid_days, image_object_path
  ) values (
    v_id, v_name, p_kind, p_points, btrim(coalesce(p_description, '')), p_stock, p_active,
    v_amount, v_store, v_days, v_image
  )
  on conflict (id) do update set
    name = excluded.name,
    kind = excluded.kind,
    points_cost = excluded.points_cost,
    description = excluded.description,
    stock = excluded.stock,
    is_active = excluded.is_active,
    voucher_amount_hkd = excluded.voucher_amount_hkd,
    shopify_store_id = excluded.shopify_store_id,
    voucher_valid_days = excluded.voucher_valid_days,
    image_object_path = excluded.image_object_path;
  return v_id;
end $$;

create or replace function public.customer_portal_ops_list_reward_catalog()
returns jsonb language plpgsql stable security definer set search_path=public, private, pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'kind', kind, 'points_cost', points_cost, 'description', description, 'stock', stock,
    'is_active', is_active, 'voucher_amount_hkd', voucher_amount_hkd, 'shopify_store_id', shopify_store_id,
    'voucher_valid_days', voucher_valid_days, 'image_object_path', image_object_path
  ) order by is_active desc, points_cost, name) from customer_reward_catalog), '[]');
end $$;

revoke all on function public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean, numeric, uuid, integer, text)
  from public, anon;
grant execute on function public.customer_portal_ops_upsert_reward_catalog(uuid, text, text, bigint, text, integer, boolean, numeric, uuid, integer, text)
  to authenticated;
