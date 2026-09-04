-- Restaurant shop-order catalog: enable 淘大 and add the two suppliers
-- that exist on the product list but not in the FCCD supplier master.

update public.suppliers
set
  is_active = true,
  updated_at = now()
where company_name = '淘大'
  and archived_at is null;

insert into public.suppliers (
  legacy_id,
  company_name,
  is_active,
  comment,
  bubble_created_at,
  bubble_modified_at
)
select
  'web-supplier-shop-catalog-junfeng',
  '浚峰企業有限公司',
  true,
  'Created from restaurant supplier product catalog.',
  now(),
  now()
where not exists (
  select 1
  from public.suppliers
  where company_name = '浚峰企業有限公司'
    and archived_at is null
);

insert into public.suppliers (
  legacy_id,
  company_name,
  is_active,
  comment,
  bubble_created_at,
  bubble_modified_at
)
select
  'web-supplier-shop-catalog-yakult',
  '益力多公司',
  true,
  'Created from restaurant supplier product catalog.',
  now(),
  now()
where not exists (
  select 1
  from public.suppliers
  where company_name = '益力多公司'
    and archived_at is null
);
