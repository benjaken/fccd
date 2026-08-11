-- Lossless research staging for the Bubble-to-Supabase migration.
-- Only these migration_* tables are reset by the migration tool.

create table public.migration_entity_catalog (
  source_type text primary key,
  swagger_type text not null unique,
  display_name text not null,
  category text not null check (
    category in (
      'customer_crm',
      'orders_quotes',
      'products_packages',
      'ingredients_production',
      'delivery',
      'payments_costs_purchasing',
      'meat_inventory',
      'shop_operations',
      'calendar_status_users',
      'system'
    )
  ),
  entity_role text not null check (entity_role in ('core', 'supporting')),
  sort_order integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_base_url text not null,
  status text not null default 'running' check (
    status in ('running', 'completed', 'completed_with_errors', 'failed', 'cancelled')
  ),
  reset_before_import boolean not null default true,
  requested_types integer not null default 0,
  completed_types integer not null default 0,
  failed_types integer not null default 0,
  imported_records bigint not null default 0,
  confirmation_text text,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index migration_one_active_run_idx
  on public.migration_runs ((status))
  where status = 'running';

create table public.migration_progress (
  run_id uuid not null references public.migration_runs(id) on delete cascade,
  source_type text not null references public.migration_entity_catalog(source_type),
  status text not null default 'pending' check (
    status in ('pending', 'running', 'completed', 'failed', 'skipped')
  ),
  next_cursor integer not null default 0,
  source_count bigint,
  imported_count bigint not null default 0,
  error_message text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (run_id, source_type)
);

create index migration_progress_status_idx
  on public.migration_progress (run_id, status);

create table public.migration_bubble_records (
  source_type text not null references public.migration_entity_catalog(source_type),
  legacy_id text not null,
  payload jsonb not null,
  source_created_at timestamptz,
  source_modified_at timestamptz,
  source_slug text,
  run_id uuid not null references public.migration_runs(id),
  migrated_at timestamptz not null default now(),
  primary key (source_type, legacy_id)
);

create index migration_bubble_records_run_idx
  on public.migration_bubble_records (run_id);

create index migration_bubble_records_modified_idx
  on public.migration_bubble_records (source_type, source_modified_at desc);

alter table public.migration_entity_catalog enable row level security;
alter table public.migration_runs enable row level security;
alter table public.migration_progress enable row level security;
alter table public.migration_bubble_records enable row level security;

revoke all on public.migration_entity_catalog from anon, authenticated;
revoke all on public.migration_runs from anon, authenticated;
revoke all on public.migration_progress from anon, authenticated;
revoke all on public.migration_bubble_records from anon, authenticated;

grant all on public.migration_entity_catalog to service_role;
grant all on public.migration_runs to service_role;
grant all on public.migration_progress to service_role;
grant all on public.migration_bubble_records to service_role;

insert into public.migration_entity_catalog
  (source_type, swagger_type, display_name, category, entity_role, sort_order)
values
  ('A_Customers', 'a_customers', 'Customers', 'customer_crm', 'core', 10),
  ('M_customer', 'm_customer', 'Meat customers', 'customer_crm', 'core', 20),
  ('DS_customer_tag', 'ds_customer_tag', 'Customer tags', 'customer_crm', 'supporting', 30),
  ('DS_customer_tag_type', 'ds_customer_tag_type', 'Customer tag types', 'customer_crm', 'supporting', 40),
  ('S_customer_tag', 's_customer_tag', 'Customer tag links', 'customer_crm', 'supporting', 50),
  ('DS_Sales Partner', 'ds_salespartner', 'Sales partners', 'customer_crm', 'supporting', 60),
  ('DS_Channel', 'ds_channel', 'Channels', 'customer_crm', 'supporting', 70),
  ('DS Commu Channels (quote)', 'dscommuchannels(quote)', 'Quote communication channels', 'customer_crm', 'supporting', 80),
  ('DS Source of sales (quote)', 'dssourceofsales(quote)', 'Quote sales sources', 'customer_crm', 'supporting', 90),
  ('DS reminder person(first)', 'dsreminderperson(first)', 'First reminder recipients', 'customer_crm', 'supporting', 100),
  ('DS reminder person(second)', 'dsreminderperson(second)', 'Second reminder recipients', 'customer_crm', 'supporting', 110),

  ('A_Order', 'a_order', 'Orders and quotes', 'orders_quotes', 'core', 200),
  ('S_Order', 's_order', 'Order lines', 'orders_quotes', 'core', 210),
  ('S_comment', 's_comment', 'Order comments', 'orders_quotes', 'core', 220),
  ('NOS_order Tag', 'nos_ordertag', 'Order tags', 'orders_quotes', 'supporting', 230),
  ('quote_file', 'quote_file', 'Quote files', 'orders_quotes', 'supporting', 240),
  ('quote_T&C', 'quote_t&c', 'Quote terms snapshots', 'orders_quotes', 'supporting', 250),
  ('quote_payment method', 'quote_paymentmethod', 'Quote payment method snapshots', 'orders_quotes', 'supporting', 260),
  ('DS_quote_T&C', 'ds_quote_t&c', 'Quote term templates', 'orders_quotes', 'supporting', 270),
  ('DS_quote_payment', 'ds_quote_payment', 'Quote payment templates', 'orders_quotes', 'supporting', 280),
  ('DS_quote_delivery', 'ds_quote_delivery', 'Quote delivery templates', 'orders_quotes', 'supporting', 290),

  ('A_Packages', 'a_packages', 'Packages', 'products_packages', 'core', 300),
  ('A_Products', 'a_products', 'Products', 'products_packages', 'core', 310),
  ('S_Packages_Product', 's_packages_product', 'Package products', 'products_packages', 'core', 320),
  ('S_Packages_ChoiceSet', 's_packages_choiceset', 'Package choice sets', 'products_packages', 'core', 330),
  ('Cal_Package_choice', 'cal_package_choice', 'Package choice calculations', 'products_packages', 'supporting', 340),
  ('DS AO product', 'dsaoproduct', 'Order product options', 'products_packages', 'supporting', 350),
  ('DS_Collection', 'ds_collection', 'Collections', 'products_packages', 'supporting', 360),
  ('DS_CookType', 'ds_cooktype', 'Cook types', 'products_packages', 'supporting', 370),
  ('DS_Type', 'ds_type', 'Product types', 'products_packages', 'supporting', 380),
  ('DS_Tags', 'ds_tags', 'Product tags', 'products_packages', 'supporting', 390),
  ('A_Label', 'a_label', 'Labels', 'products_packages', 'supporting', 400),
  ('bento_main type', 'bento_maintype', 'Bento main types', 'products_packages', 'supporting', 410),
  ('bento_main ingredients', 'bento_mainingredients', 'Bento main ingredients', 'products_packages', 'supporting', 420),
  ('bento_number of column', 'bento_numberofcolumn', 'Bento column counts', 'products_packages', 'supporting', 430),
  ('bento_special request', 'bento_specialrequest', 'Bento special requests', 'products_packages', 'supporting', 440),
  ('DS_bento_additional item', 'ds_bento_additionalitem', 'Bento additional items', 'products_packages', 'supporting', 450),
  ('DS_bento_event part', 'ds_bento_eventpart', 'Bento event parts', 'products_packages', 'supporting', 460),
  ('Quote_bento_additional item', 'quote_bento_additionalitem', 'Quote bento additional items', 'products_packages', 'supporting', 470),
  ('Quote_bento_event part', 'quote_bento_eventpart', 'Quote bento event parts', 'products_packages', 'supporting', 480),
  ('OS driver_menu', 'osdriver_menu', 'Driver menu options', 'products_packages', 'supporting', 490),
  ('Print_Label', 'print_label', 'Print labels', 'products_packages', 'supporting', 500),
  ('Font', 'font', 'Fonts', 'products_packages', 'supporting', 510),
  ('MM_Products', 'mm_products', 'MM products', 'products_packages', 'supporting', 520),

  ('DS_Ingredients', 'ds_ingredients', 'Ingredients', 'ingredients_production', 'core', 600),
  ('S_Ingredients_Product', 's_ingredients_product', 'Product ingredients', 'ingredients_production', 'core', 610),
  ('B_Product_Ingredients', 'b_product_ingredients', 'Product ingredient requirements', 'ingredients_production', 'core', 620),
  ('DS_Packing', 'ds_packing', 'Packing materials', 'ingredients_production', 'core', 630),
  ('Cal_Control', 'cal_control', 'Production calculations', 'ingredients_production', 'supporting', 640),
  ('M_cal_to_kg', 'm_cal_to_kg', 'Weight conversions', 'ingredients_production', 'supporting', 650),
  ('M_calculation%', 'm_calculation%', 'Yield calculations', 'ingredients_production', 'supporting', 660),

  ('B_delivery schedule', 'b_deliveryschedule', 'Delivery schedules', 'delivery', 'core', 700),
  ('B_delivery schedule_surcharge', 'b_deliveryschedule_surcharge', 'Delivery surcharges', 'delivery', 'core', 710),
  ('DS_delivery district', 'ds_deliverydistrict', 'Delivery districts', 'delivery', 'supporting', 720),
  ('DS_delivery surcharge', 'ds_deliverysurcharge', 'Delivery surcharge rules', 'delivery', 'supporting', 730),
  ('DS_Shipping Method', 'ds_shippingmethod', 'Shipping methods', 'delivery', 'supporting', 740),
  ('DS_Super_Motorcade', 'ds_super_motorcade', 'Motorcades', 'delivery', 'core', 750),
  ('DS_Super_Motorcade_subDriver', 'ds_super_motorcade_subdriver', 'Sub-drivers', 'delivery', 'core', 760),
  ('DS_driver assign remind', 'ds_driverassignremind', 'Driver assignment reminders', 'delivery', 'supporting', 770),
  ('M_shippingMethod', 'm_shippingmethod', 'Meat shipping methods', 'delivery', 'supporting', 780),

  ('S_Payment', 's_payment', 'Payments', 'payments_costs_purchasing', 'core', 800),
  ('S_Payment Report', 's_paymentreport', 'Payment reports', 'payments_costs_purchasing', 'core', 810),
  ('DS_Payment Method', 'ds_paymentmethod', 'Payment methods', 'payments_costs_purchasing', 'supporting', 820),
  ('B_cost monthly', 'b_costmonthly', 'Monthly costs', 'payments_costs_purchasing', 'core', 830),
  ('DS_cost_type', 'ds_cost_type', 'Cost types', 'payments_costs_purchasing', 'supporting', 840),
  ('B_supplierPurchase', 'b_supplierpurchase', 'Catering supplier purchases', 'payments_costs_purchasing', 'core', 850),
  ('B_ads cost weekly', 'b_adscostweekly', 'Weekly advertising costs', 'payments_costs_purchasing', 'core', 860),
  ('DS_Purchase Type', 'ds_purchasetype', 'Purchase types', 'payments_costs_purchasing', 'supporting', 870),
  ('DS__ingredient_Supplier', 'ds__ingredient_supplier', 'Ingredient suppliers', 'payments_costs_purchasing', 'core', 880),

  ('M_rawMeat', 'm_rawmeat', 'Raw meat', 'meat_inventory', 'core', 900),
  ('M_raw_stock', 'm_raw_stock', 'Raw meat stock', 'meat_inventory', 'core', 910),
  ('M_doneMeat', 'm_donemeat', 'Finished meat', 'meat_inventory', 'core', 920),
  ('M_doneMeat_stock', 'm_donemeat_stock', 'Finished meat stock', 'meat_inventory', 'core', 930),
  ('M_outDone_order', 'm_outdone_order', 'Finished meat orders', 'meat_inventory', 'core', 940),
  ('M_outDone_doneMeat', 'm_outdone_donemeat', 'Finished meat order lines', 'meat_inventory', 'core', 950),
  ('M_seasoning', 'm_seasoning', 'Seasonings', 'meat_inventory', 'core', 960),
  ('M_MeatSeasoning_cost', 'm_meatseasoning_cost', 'Meat seasoning costs', 'meat_inventory', 'core', 970),
  ('M_Monthly_MeatPrice', 'm_monthly_meatprice', 'Monthly meat prices', 'meat_inventory', 'core', 980),
  ('S_ingredient_stocktake', 's_ingredient_stocktake', 'Ingredient stocktakes', 'meat_inventory', 'core', 990),
  ('S_Packing_Stocktake', 's_packing_stocktake', 'Packing stocktakes', 'meat_inventory', 'core', 1000),

  ('SHOP_dailySales', 'shop_dailysales', 'Shop daily sales', 'shop_operations', 'core', 1100),
  ('SHOP_DS cost', 'shop_dscost', 'Shop costs', 'shop_operations', 'core', 1110),
  ('SHOP_DS Cost_type', 'shop_dscost_type', 'Shop cost types', 'shop_operations', 'supporting', 1120),
  ('SHOP_DS_holiday', 'shop_ds_holiday', 'Shop holidays', 'shop_operations', 'supporting', 1130),
  ('SHOP_DS_new_product', 'shop_ds_new_product', 'Shop products', 'shop_operations', 'core', 1140),
  ('SHOP_DS payment method', 'shop_dspaymentmethod', 'Shop payment methods', 'shop_operations', 'supporting', 1150),
  ('SHOP DS Restro', 'shopdsrestro', 'Restaurants', 'shop_operations', 'core', 1160),
  ('SHOP_DS_restro_depart', 'shop_ds_restro_depart', 'Restaurant departments', 'shop_operations', 'core', 1170),
  ('SHOP_DS_staff_list', 'shop_ds_staff_list', 'Shop staff', 'shop_operations', 'core', 1180),
  ('SHOP DS restro_period', 'shop_dsrestro_period', 'Restaurant periods', 'shop_operations', 'supporting', 1190),
  ('SHOP_food_deli_platform', 'shop_food_deli_platform', 'Food delivery platforms', 'shop_operations', 'supporting', 1200),
  ('SHOP_Ingredients', 'shop_ingredients', 'Shop ingredients', 'shop_operations', 'core', 1210),
  ('SHOP_monthly_cost', 'shop_monthly_cost', 'Shop monthly costs', 'shop_operations', 'core', 1220),
  ('SHOP_roster', 'shop_roster', 'Shop rosters', 'shop_operations', 'core', 1230),
  ('SHOP_StockTake', 'shop_stocktake', 'Shop stocktakes', 'shop_operations', 'core', 1240),
  ('SHOP_supplier_purchase', 'shop_supplier_purchase', 'Shop supplier purchases', 'shop_operations', 'core', 1250),
  ('SHOP_DS_time_slot', 'shop_ds_time_slot', 'Shop time slots', 'shop_operations', 'supporting', 1260),
  ('SHOP DS_Purchase Type', 'shopds_purchasetype', 'Shop purchase types', 'shop_operations', 'supporting', 1270),

  ('DS AO_blockDate', 'dsao_blockdate', 'Order block dates', 'calendar_status_users', 'supporting', 1300),
  ('DS_Festival', 'ds_festival', 'Festivals', 'calendar_status_users', 'supporting', 1310),
  ('DS_Status', 'ds_status', 'Order statuses', 'calendar_status_users', 'supporting', 1320),
  ('User', 'user', 'Legacy users', 'calendar_status_users', 'core', 1330),
  ('Announcement', 'announcement', 'Announcements', 'system', 'supporting', 1400);
