-- Catering split numbers such as #7041A / #7041B are typed with a leading #
-- when an order is copied. Keep that hash. Purely numeric Catering numbers
-- still gain a #, and every other leading # is still removed.

create or replace function private.standardize_order_number(
  p_order_number text,
  p_channel_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select btrim(coalesce(p_order_number, '')) as raw
  ),
  normalized as (
    select
      input.raw ~ '^#' as had_hash,
      nullif(
        btrim(regexp_replace(input.raw, '^(#\s*)+', '')),
        ''
      ) as value
    from input
  )
  select case
    when normalized.value is null then null
    when exists (
        select 1
        from public.channels
        where channels.id = p_channel_id
          and lower(btrim(channels.name)) in (
            'catering',
            'food channel catering',
            'food channels catering'
          )
      )
      and (
        normalized.value ~ '^[0-9]+$'
        or (
          normalized.had_hash
          and normalized.value ~ '^[0-9]+[A-Za-z]+$'
        )
      )
      then '#' || normalized.value
    else normalized.value
  end
  from normalized;
$$;

comment on function private.standardize_order_number(text, uuid) is
  'Adds # to purely numeric Catering numbers, keeps a typed # on Catering splits such as 7041A, and removes a leading # from all others.';

revoke all on function private.standardize_order_number(text, uuid) from public, anon, authenticated;

update public.orders
set
  order_number = '#' || btrim(order_number),
  updated_at = now()
where archived_at is null
  and btrim(order_number) in ('7041A', '7041B');

update public.payments as payment
set
  order_number_snapshot = orders.order_number,
  updated_at = now()
from public.orders as orders
where payment.order_id = orders.id
  and orders.order_number in ('#7041A', '#7041B')
  and payment.order_number_snapshot is distinct from orders.order_number;
