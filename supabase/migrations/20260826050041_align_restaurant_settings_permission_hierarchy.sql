-- Keep every restaurant settings page below the restaurant settings node so
-- the permission editor mirrors the navigation hierarchy.
update public.app_pages
set parent_page_key = 'restaurant.settings',
    sort_order = 96,
    updated_at = now()
where page_key = 'restaurant.settings.monthly_pnl_cost_categories'
  and exists (
    select 1
    from public.app_pages
    where page_key = 'restaurant.settings'
  );
