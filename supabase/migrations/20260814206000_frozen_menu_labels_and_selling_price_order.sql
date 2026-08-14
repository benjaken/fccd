-- Frozen Goods menu labels and selling-price-cost position.

do $$
declare
  prepared_sort integer;
  selling_sort integer;
  delivery_sort integer;
begin
  update public.app_pages
  set
    display_name = '客戶管理',
    updated_at = now()
  where page_key = 'frozen.meat_customers';

  update public.app_pages
  set
    display_name = '收成錯誤統計',
    updated_at = now()
  where page_key = 'frozen.yield_errors';

  select sort_order into prepared_sort
  from public.app_pages
  where page_key = 'frozen.prepared_meat_inventory';

  select sort_order into selling_sort
  from public.app_pages
  where page_key = 'frozen.selling_price_cost';

  select sort_order into delivery_sort
  from public.app_pages
  where page_key = 'frozen.delivery_notes';

  if prepared_sort is not null and selling_sort is not null
    and selling_sort is distinct from prepared_sort + 1 then
    update public.app_pages
    set
      sort_order = prepared_sort + 1,
      updated_at = now()
    where page_key = 'frozen.selling_price_cost';

    if delivery_sort = prepared_sort + 1 then
      update public.app_pages
      set
        sort_order = selling_sort,
        updated_at = now()
      where page_key = 'frozen.delivery_notes';
    end if;
  end if;
end $$;
