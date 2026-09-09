-- Supplier cartons contain 36 packages, while stocktake and BOM consumption
-- remain expressed as individual packages.
update public.ingredients
set description = '190g x 36包/箱',
  product_unit = '包',
  stocktake_unit = '包',
  product_quantity = 1,
  cost_per_stocktake_unit = coalesce(
    cost_per_product_unit,
    cost_per_stocktake_unit
  )
where id = 'b186e205-2a0c-4121-8f33-caea80d6e0d2'
  and name = '粟米片';

do $verify$
begin
  if not exists (
    select 1
    from public.ingredients
    where id = 'b186e205-2a0c-4121-8f33-caea80d6e0d2'
      and name = '粟米片'
      and description = '190g x 36包/箱'
      and product_unit = '包'
      and stocktake_unit = '包'
      and product_quantity = 1
      and cost_per_stocktake_unit is not distinct from cost_per_product_unit
  ) then
    raise exception 'corn_flakes_supplier_packaging_repair_failed';
  end if;
end
$verify$;
