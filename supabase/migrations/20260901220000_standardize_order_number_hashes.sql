-- Canonical order-number rule used by every screen and generated document:
-- only a purely numeric Catering number carries a leading #.

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
  with normalized as (
    select nullif(
      btrim(regexp_replace(btrim(coalesce(p_order_number, '')), '^(#\s*)+', '')),
      ''
    ) as value
  )
  select case
    when normalized.value is null then null
    when normalized.value ~ '^[0-9]+$'
      and exists (
        select 1
        from public.channels
        where channels.id = p_channel_id
          and lower(btrim(channels.name)) in (
            'catering',
            'food channel catering',
            'food channels catering'
          )
      )
      then '#' || normalized.value
    else normalized.value
  end
  from normalized;
$$;

create or replace function private.standardize_order_number_on_write()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.order_number := private.standardize_order_number(
    new.order_number,
    new.channel_id
  );
  return new;
end;
$$;

drop trigger if exists zz_standardize_order_number on public.orders;
create trigger zz_standardize_order_number
before insert or update of order_number, channel_id on public.orders
for each row execute function private.standardize_order_number_on_write();

update public.orders
set order_number = private.standardize_order_number(order_number, channel_id)
where order_number is distinct from private.standardize_order_number(order_number, channel_id);

-- Payment snapshots are displayed independently in finance screens, so keep
-- them aligned with the canonical number of their linked order.
update public.payments as payment
set order_number_snapshot = orders.order_number,
    updated_at = now()
from public.orders as orders
where payment.order_id = orders.id
  and payment.order_number_snapshot is distinct from orders.order_number;

comment on function private.standardize_order_number(text, uuid) is
  'Adds # only to purely numeric Catering order numbers and removes a leading # from all others.';

revoke all on function private.standardize_order_number(text, uuid) from public, anon, authenticated;
revoke all on function private.standardize_order_number_on_write() from public, anon, authenticated;
