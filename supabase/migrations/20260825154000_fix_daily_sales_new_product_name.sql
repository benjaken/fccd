-- Retire the duplicate row that is already inactive in the Bubble source. Its
-- historical daily-sales references remain intact, while the later source row
-- remains the active 麻辣三杯雞 product.
update public.restaurant_new_products
set
  name = '[晚餐]麻辣三杯雞',
  is_active = false
where legacy_id = '1721187681817x829037214129455100';

-- Keep the missing item independent from legacy synchronization so a later
-- Bubble incremental import cannot overwrite this correction.
insert into public.restaurant_new_products (
  legacy_id,
  name,
  remarks_enabled,
  remarks_placeholder,
  is_active,
  bubble_created_at,
  bubble_modified_at
)
values (
  'web-restaurant-new-product-dinner-clear-radish-beef-brisket',
  '[晚餐]清湯蘿蔔牛腩',
  false,
  null,
  true,
  now(),
  now()
)
on conflict (legacy_id) do update
set
  name = excluded.name,
  is_active = true,
  archived_at = null;
