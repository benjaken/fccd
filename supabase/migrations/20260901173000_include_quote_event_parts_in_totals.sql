-- Bubble lunch-box quotes can store their billable amount in activity/event
-- rows while keeping the migrated product quantities at zero. Treat those
-- event prices as part of the sales document subtotal so editing or converting
-- the quote cannot overwrite its valid master total with zero.

create or replace function private.recalculate_quote_total(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders o
  set grand_total = greatest(
        coalesce((
          select sum(l.total_price)
          from public.order_lines l
          where l.order_id = p_order_id and not l.is_void
        ), 0)
        + coalesce((
          select sum(event.price_snapshot)
          from public.order_bento_event_parts event
          where event.order_id = p_order_id
        ), 0)
        + coalesce(o.shipping_fee, 0)
        - coalesce(o.discount_amount, 0)
        - coalesce(o.cashdollar_redeemed, 0),
        0
      ),
      outstanding = greatest(
        coalesce((
          select sum(l.total_price)
          from public.order_lines l
          where l.order_id = p_order_id and not l.is_void
        ), 0)
        + coalesce((
          select sum(event.price_snapshot)
          from public.order_bento_event_parts event
          where event.order_id = p_order_id
        ), 0)
        + coalesce(o.shipping_fee, 0)
        - coalesce(o.discount_amount, 0)
        - coalesce(o.cashdollar_redeemed, 0)
        - case
            when o.document_type = 'order' then coalesce((
              select sum(p.amount)
              from public.payments p
              where p.order_id = p_order_id and p.voided_at is null
            ), 0)
            else 0
          end,
        0
      ),
      updated_at = now()
  where o.id = p_order_id
    and o.document_type in ('quote', 'unconfirmed', 'order');
$$;

create or replace function private.copy_quote_supplements_to_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.document_type <> 'order' or new.source_quote_id is null then
    return new;
  end if;

  insert into public.order_bento_additional_items (
    id, legacy_id, order_id, order_legacy_id, additional_item_id,
    additional_item_legacy_id, description_snapshot, sort_order,
    bubble_created_at, bubble_modified_at
  )
  select
    gen_random_uuid(), 'web-order-bento-additional-' || gen_random_uuid(),
    new.id, new.legacy_id, source.additional_item_id,
    source.additional_item_legacy_id, source.description_snapshot,
    source.sort_order, source.bubble_created_at, source.bubble_modified_at
  from public.order_bento_additional_items source
  where source.order_id = new.source_quote_id;

  insert into public.order_bento_event_parts (
    id, legacy_id, order_id, order_legacy_id, event_part_id,
    event_part_legacy_id, description_snapshot, price_snapshot, sort_order,
    bubble_created_at, bubble_modified_at
  )
  select
    gen_random_uuid(), 'web-order-bento-event-' || gen_random_uuid(),
    new.id, new.legacy_id, source.event_part_id,
    source.event_part_legacy_id, source.description_snapshot,
    source.price_snapshot, source.sort_order, source.bubble_created_at,
    source.bubble_modified_at
  from public.order_bento_event_parts source
  where source.order_id = new.source_quote_id;

  return new;
end;
$$;

drop trigger if exists copy_quote_supplements_on_order_insert on public.orders;
create trigger copy_quote_supplements_on_order_insert
after insert on public.orders
for each row
when (new.document_type = 'order' and new.source_quote_id is not null)
execute function private.copy_quote_supplements_to_order();

-- Repair active converted orders created before the trigger was installed.
insert into public.order_bento_additional_items (
  id, legacy_id, order_id, order_legacy_id, additional_item_id,
  additional_item_legacy_id, description_snapshot, sort_order,
  bubble_created_at, bubble_modified_at
)
select
  gen_random_uuid(), 'web-order-bento-additional-' || gen_random_uuid(),
  generated.id, generated.legacy_id, source.additional_item_id,
  source.additional_item_legacy_id, source.description_snapshot,
  source.sort_order, source.bubble_created_at, source.bubble_modified_at
from public.orders generated
join public.order_bento_additional_items source
  on source.order_id = generated.source_quote_id
where generated.document_type = 'order'
  and generated.archived_at is null
  and generated.source_quote_id is not null
  and not exists (
    select 1
    from public.order_bento_additional_items existing
    where existing.order_id = generated.id
      and existing.description_snapshot is not distinct from source.description_snapshot
  );

insert into public.order_bento_event_parts (
  id, legacy_id, order_id, order_legacy_id, event_part_id,
  event_part_legacy_id, description_snapshot, price_snapshot, sort_order,
  bubble_created_at, bubble_modified_at
)
select
  gen_random_uuid(), 'web-order-bento-event-' || gen_random_uuid(),
  generated.id, generated.legacy_id, source.event_part_id,
  source.event_part_legacy_id, source.description_snapshot,
  source.price_snapshot, source.sort_order, source.bubble_created_at,
  source.bubble_modified_at
from public.orders generated
join public.order_bento_event_parts source
  on source.order_id = generated.source_quote_id
where generated.document_type = 'order'
  and generated.archived_at is null
  and generated.source_quote_id is not null
  and not exists (
    select 1
    from public.order_bento_event_parts existing
    where existing.order_id = generated.id
      and existing.description_snapshot is not distinct from source.description_snapshot
      and existing.price_snapshot is not distinct from source.price_snapshot
  );

select private.recalculate_quote_total(document.id)
from public.orders document
where document.archived_at is null
  and document.document_type in ('quote', 'unconfirmed', 'order')
  and exists (
    select 1
    from public.order_bento_event_parts event
    where event.order_id = document.id
  );
