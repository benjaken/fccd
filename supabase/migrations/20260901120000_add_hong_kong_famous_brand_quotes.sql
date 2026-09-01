alter table public.orders
  add column if not exists is_hong_kong_famous_brand boolean not null default false;

comment on column public.orders.is_hong_kong_famous_brand is
  'Marks a quote customer as a well-known Hong Kong brand. Open and Done Deal quotes appear on the famous brand customers page.';

-- Backfill the well-known Hong Kong clients identified from existing successful
-- quotes. Match both migrated customer and company snapshots because the legacy
-- import often stored the organisation in customer_name_snapshot.
update public.orders
set is_hong_kong_famous_brand = true,
    updated_at = now()
where document_type = 'quote'
  and quote_status = 'Done Deal'
  and (
    coalesce(customer_name_snapshot, '') ilike any (array[
      '%hang seng%',
      '%morgan stanley%',
      '%morgan stanely%',
      '%caritas medical centre%',
      '%明愛醫院%',
      '%hong kong design centre%',
      '%rocco design architects%',
      '%new life psychiatric rehabilitation association%',
      '%新生精神康復會%'
    ])
    or coalesce(company_name_snapshot, '') ilike any (array[
      '%hang seng%',
      '%morgan stanley%',
      '%morgan stanely%',
      '%caritas medical centre%',
      '%明愛醫院%',
      '%hong kong design centre%',
      '%rocco design architects%',
      '%new life psychiatric rehabilitation association%',
      '%新生精神康復會%'
    ])
  );

create index if not exists orders_hk_famous_brand_active_idx
  on public.orders (updated_at desc)
  where document_type = 'quote'
    and quote_status is distinct from 'Case Closed'
    and is_hong_kong_famous_brand = true;
