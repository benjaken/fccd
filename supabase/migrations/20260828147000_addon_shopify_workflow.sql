-- Track the operational task of copying a paid self-service add-on into
-- Shopify separately from the permanent is_addon marker on each order line.

alter table public.orders
  add column if not exists addon_shopify_pending boolean not null default false,
  add column if not exists addon_shopify_confirmed_at timestamptz,
  add column if not exists addon_shopify_confirmed_by uuid references auth.users(id) on delete set null;

create index if not exists orders_addon_shopify_pending_idx
  on public.orders(created_at desc)
  where addon_shopify_pending;

create or replace function private.mark_addon_shopify_pending()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.is_addon and not new.is_void and new.addon_checkout_id is not null then
    update public.orders
    set addon_shopify_pending = true,
        addon_shopify_confirmed_at = null,
        addon_shopify_confirmed_by = null,
        updated_at = now()
    where id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_addon_shopify_pending on public.order_lines;
create trigger mark_addon_shopify_pending
after insert on public.order_lines
for each row execute function private.mark_addon_shopify_pending();

update public.orders orders
set addon_shopify_pending = true
where exists (
  select 1 from public.order_lines line
  where line.order_id = orders.id
    and line.is_addon and not line.is_void
    and line.addon_checkout_id is not null
)
and orders.addon_shopify_confirmed_at is null;

create or replace function public.confirm_order_addon_shopify_input(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_manage('orders') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_order_id and document_type = 'order' and archived_at is null
  ) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  update public.orders
  set addon_shopify_pending = false,
      addon_shopify_confirmed_at = now(),
      addon_shopify_confirmed_by = auth.uid(),
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.confirm_order_addon_shopify_input(uuid) from public, anon;
grant execute on function public.confirm_order_addon_shopify_input(uuid) to authenticated;

create or replace function public.is_self_service_addon_block_date(p_delivery_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.self_service_addon_block_dates block
    where block.block_date = p_delivery_date and block.archived_at is null
  )
$$;

revoke all on function public.is_self_service_addon_block_date(date) from public, anon;
grant execute on function public.is_self_service_addon_block_date(date) to authenticated;
