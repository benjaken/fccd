-- Utensil packs are fulfilment supplies, not customer add-on items. Normalise
-- existing rows and enforce the distinction for every future write source.
create or replace function private.exclude_utensil_pack_from_addons()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.is_addon and (
    position('餐具包' in coalesce(new.product_name_snapshot, '')) > 0
    or position('餐具包' in coalesce(new.content_snapshot, '')) > 0
    or exists (
      select 1
      from public.products product
      where product.id = new.product_id
        and (
          position('餐具包' in coalesce(product.name, '')) > 0
          or position('餐具包' in coalesce(product.chinese_name, '')) > 0
        )
    )
    or exists (
      select 1
      from public.packages package
      where package.id = new.package_id
        and (
          position('餐具包' in coalesce(package.name, '')) > 0
          or position('餐具包' in coalesce(package.chinese_name, '')) > 0
        )
    )
  ) then
    new.is_addon := false;
  end if;
  return new;
end;
$$;

drop trigger if exists exclude_utensil_pack_from_addons on public.order_lines;
create trigger exclude_utensil_pack_from_addons
before insert or update of is_addon, product_name_snapshot, content_snapshot, product_id, package_id
on public.order_lines
for each row execute function private.exclude_utensil_pack_from_addons();

update public.order_lines line
set is_addon = false
where line.is_addon
  and (
    position('餐具包' in coalesce(line.product_name_snapshot, '')) > 0
    or position('餐具包' in coalesce(line.content_snapshot, '')) > 0
    or exists (
      select 1
      from public.products product
      where product.id = line.product_id
        and (
          position('餐具包' in coalesce(product.name, '')) > 0
          or position('餐具包' in coalesce(product.chinese_name, '')) > 0
        )
    )
    or exists (
      select 1
      from public.packages package
      where package.id = line.package_id
        and (
          position('餐具包' in coalesce(package.name, '')) > 0
          or position('餐具包' in coalesce(package.chinese_name, '')) > 0
        )
    )
  );
