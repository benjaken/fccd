-- New and copied web orders receive a fresh, brand-specific number at insert
-- time. The advisory lock prevents concurrent copies from receiving the same
-- monthly sequence.
create or replace function private.assign_web_order_number()
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
  if new.document_type <> 'order'
     or new.legacy_id not like 'web-order-%'
     or nullif(btrim(new.order_number), '') is not null then
    return new;
  end if;

  select lower(btrim(channels.name))
  into v_channel_name
  from public.channels
  where channels.id = new.channel_id;

  v_prefix := case v_channel_name
    when 'catering' then 'FCCO'
    when 'hk lunch box' then 'FCBO'
    when 'kitchen' then 'FCKO'
    when 'express' then 'FCEO'
    when 'cuisine' then 'FCLO'
    when 'delivery' then 'FCDO'
    when 'residential' then 'FCRO'
    when 'hk party food' then 'FCPO'
    else 'FCO'
  end;

  perform pg_advisory_xact_lock(hashtext('order-number-' || v_prefix || v_month));
  select coalesce(
    max(substring(orders.order_number from char_length(v_prefix) + 7)::integer),
    0
  ) + 1
  into v_sequence
  from public.orders
  where orders.order_number ~ ('^' || v_prefix || v_month || '[0-9]+$');

  new.order_number := v_prefix || v_month || lpad(v_sequence::text, 2, '0');
  return new;
end;
$$;

drop trigger if exists assign_web_order_number on public.orders;
create trigger assign_web_order_number
before insert on public.orders
for each row execute function private.assign_web_order_number();

comment on function private.assign_web_order_number() is
  'Assigns a fresh brand and month sequence to new web orders, including copied orders.';
