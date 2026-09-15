-- One kitchen means intake restrictions are global. Brand/product rows describe
-- exceptions and recommendations; they are not separate kitchen capacities.
create table if not exists public.order_intake_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  start_time time,
  end_time time,
  handling text not null default 'manual_review'
    check (handling in ('allow_only', 'manual_review')),
  addon_handling text not null default 'manual_review'
    check (addon_handling in ('allow', 'manual_review')),
  customer_message text,
  internal_note text,
  is_active boolean not null default true,
  legacy_block_date_id uuid unique references public.self_service_addon_block_dates(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (ends_on >= starts_on),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time)
);

create index if not exists order_intake_rules_active_dates_idx
  on public.order_intake_rules (starts_on, ends_on)
  where is_active and archived_at is null;

create table if not exists public.order_intake_rule_channels (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.order_intake_rules(id) on delete cascade,
  channel_id uuid not null references public.channels(id),
  brand_terms text[] not null default '{}',
  product_terms text[] not null default '{}',
  recommendation_url text,
  created_at timestamptz not null default now(),
  unique (rule_id, channel_id)
);

alter table public.order_intake_rules enable row level security;
alter table public.order_intake_rule_channels enable row level security;
revoke all on table public.order_intake_rules, public.order_intake_rule_channels from public, anon, authenticated;
grant select, insert, update on table public.order_intake_rules, public.order_intake_rule_channels to authenticated;
grant all on table public.order_intake_rules, public.order_intake_rule_channels to service_role;

drop policy if exists "Order intake rule readers" on public.order_intake_rules;
create policy "Order intake rule readers" on public.order_intake_rules
  for select to authenticated using (private.has_page_access('orders.settings.addon_block_dates'));
drop policy if exists "Order intake rule managers insert" on public.order_intake_rules;
create policy "Order intake rule managers insert" on public.order_intake_rules
  for insert to authenticated with check (private.has_page_manage('orders.settings.addon_block_dates'));
drop policy if exists "Order intake rule managers update" on public.order_intake_rules;
create policy "Order intake rule managers update" on public.order_intake_rules
  for update to authenticated using (private.has_page_manage('orders.settings.addon_block_dates'))
  with check (private.has_page_manage('orders.settings.addon_block_dates'));
drop policy if exists "Order intake channel readers" on public.order_intake_rule_channels;
create policy "Order intake channel readers" on public.order_intake_rule_channels
  for select to authenticated using (private.has_page_access('orders.settings.addon_block_dates'));
drop policy if exists "Order intake channel managers insert" on public.order_intake_rule_channels;
create policy "Order intake channel managers insert" on public.order_intake_rule_channels
  for insert to authenticated with check (private.has_page_manage('orders.settings.addon_block_dates'));
drop policy if exists "Order intake channel managers update" on public.order_intake_rule_channels;
create policy "Order intake channel managers update" on public.order_intake_rule_channels
  for update to authenticated using (private.has_page_manage('orders.settings.addon_block_dates'))
  with check (private.has_page_manage('orders.settings.addon_block_dates'));
drop policy if exists "Order intake channel managers delete" on public.order_intake_rule_channels;
create policy "Order intake channel managers delete" on public.order_intake_rule_channels
  for delete to authenticated using (private.has_page_manage('orders.settings.addon_block_dates'));

insert into public.order_intake_rules (
  name, starts_on, ends_on, handling, addon_handling, customer_message,
  internal_note, legacy_block_date_id, created_by
)
select
  '舊 Block Date ' || to_char(block.block_date, 'DD/MM/YYYY'),
  block.block_date, block.block_date, 'manual_review', 'manual_review',
  '該日有特別接單安排，請先留下需求，由同事確認。', block.reason,
  block.id, block.created_by
from public.self_service_addon_block_dates block
where block.archived_at is null
on conflict (legacy_block_date_id) do nothing;

update public.app_pages
set display_name = '接單安排', updated_at = now()
where page_key = 'orders.settings.addon_block_dates';

create or replace function private.self_service_addon_unavailable_reason(p_order public.orders)
returns text language plpgsql stable set search_path = public, private as $$
declare v_delivery_date date; v_cutoff timestamptz;
begin
  if p_order.id is null or p_order.document_type <> 'order' or p_order.archived_at is not null then return 'order_unavailable'; end if;
  if p_order.delivery_at is null then return 'delivery_date_missing'; end if;
  if coalesce(p_order.delivery_status, '') in ('已取消', '己取消', '取消', '已送達', '己送達') then return 'order_closed'; end if;
  v_delivery_date := (p_order.delivery_at at time zone 'Asia/Hong_Kong')::date;
  if exists (
    select 1 from public.order_intake_rules rule
    where rule.is_active and rule.archived_at is null
      and v_delivery_date between rule.starts_on and rule.ends_on
      and rule.addon_handling = 'manual_review'
      and (rule.start_time is null or (p_order.delivery_at at time zone 'Asia/Hong_Kong')::time >= rule.start_time)
      and (rule.end_time is null or (p_order.delivery_at at time zone 'Asia/Hong_Kong')::time < rule.end_time)
  ) then return 'block_date'; end if;
  v_cutoff := private.self_service_addon_cutoff(p_order.delivery_at);
  if now() >= v_cutoff then return 'cutoff_passed'; end if;
  if not exists (
    select 1 from public.self_service_addon_products setting
    join public.products product on product.id = setting.product_id
    where setting.channel_id = p_order.channel_id and setting.is_active and setting.archived_at is null
      and product.is_active and product.archived_at is null and coalesce(setting.price_override, product.price) > 0
  ) then return 'no_products'; end if;
  return null;
end;
$$;
