-- Keep legacy quote numbering per brand and allow unconfirmed quotes to use
-- the same editor workflow while remaining in a separate queue.

alter table public.orders
  add column if not exists asana_link text;

create or replace function private.assign_web_quote_number()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_channel_name text;
  v_prefix text;
  v_month text := to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMM');
  v_sequence integer;
begin
  if new.document_type not in ('quote', 'unconfirmed')
     or new.legacy_id not like 'web-quote-%' then
    return new;
  end if;

  select lower(btrim(c.name)) into v_channel_name
  from public.channels c
  where c.id = new.channel_id;

  v_prefix := case v_channel_name
    when 'catering' then 'FCCQ'
    when 'hk lunch box' then 'FCBQ'
    when 'kitchen' then 'FCKQ'
    when 'express' then 'FCEQ'
    when 'cuisine' then 'FCLQ'
    when 'delivery' then 'FCDQ'
    when 'residential' then 'FCRQ'
    when 'hk party food' then 'FCPQ'
    else 'FCQ'
  end;

  perform pg_advisory_xact_lock(hashtext('quote-number-' || v_prefix || v_month));
  select coalesce(max(substring(o.order_number from char_length(v_prefix) + 7)::integer), 0) + 1
    into v_sequence
  from public.orders o
  where o.order_number ~ ('^' || v_prefix || v_month || '[0-9]+$');

  new.order_number := v_prefix || v_month || lpad(v_sequence::text, 2, '0');
  return new;
end;
$$;

drop trigger if exists assign_web_quote_number on public.orders;
create trigger assign_web_quote_number
before insert on public.orders
for each row execute function private.assign_web_quote_number();

create or replace function private.recalculate_quote_total(p_order_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.orders o
  set grand_total = greatest(
        coalesce((select sum(l.total_price) from public.order_lines l where l.order_id = p_order_id and not l.is_void), 0)
        + coalesce(o.shipping_fee, 0) - coalesce(o.discount_amount, 0),
        0
      ),
      outstanding = greatest(
        coalesce((select sum(l.total_price) from public.order_lines l where l.order_id = p_order_id and not l.is_void), 0)
        + coalesce(o.shipping_fee, 0) - coalesce(o.discount_amount, 0),
        0
      ),
      updated_at = now()
  where o.id = p_order_id and o.document_type in ('quote', 'unconfirmed');
$$;

create or replace function public.add_quote_line(
  p_order_id uuid,
  p_item_kind text,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_remarks text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line_id uuid := gen_random_uuid();
  v_sku text;
  v_name text;
  v_product_id uuid;
  v_package_id uuid;
  v_item_order numeric;
begin
  if p_quantity <= 0 or p_unit_price < 0 then
    raise exception 'invalid_quote_line' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_order_id and document_type in ('quote', 'unconfirmed')
  ) then
    raise exception 'quote_not_found' using errcode = 'P0002';
  end if;

  if p_item_kind = 'product' then
    select p.id, p.sku, coalesce(p.chinese_name, p.name)
      into v_product_id, v_sku, v_name
    from public.products p where p.id = p_item_id and p.archived_at is null;
  elsif p_item_kind = 'package' then
    select p.id, p.sku, coalesce(p.chinese_name, p.name)
      into v_package_id, v_sku, v_name
    from public.packages p where p.id = p_item_id and p.archived_at is null;
  else
    raise exception 'invalid_item_kind' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'catalog_item_not_found' using errcode = 'P0002';
  end if;

  select coalesce(max(item_order), 0) + 1 into v_item_order
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    id, legacy_id, order_id, product_id, package_id, sku_snapshot,
    product_name_snapshot, quantity, unit_price, total_price, item_order, remarks_1
  ) values (
    v_line_id, 'web-quote-line-' || v_line_id, p_order_id, v_product_id,
    v_package_id, v_sku, v_name, p_quantity, p_unit_price,
    round(p_quantity * p_unit_price, 2), v_item_order, nullif(btrim(p_remarks), '')
  );
  perform private.recalculate_quote_total(p_order_id);
  return v_line_id;
end;
$$;

comment on column public.orders.asana_link is
  'URL of the Asana task associated with this quote or unconfirmed quote.';
