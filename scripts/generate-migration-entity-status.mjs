import { readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(
    ".migration-data/full-snapshot/export-manifest.json",
    "utf8",
  ),
);

const completed = {
  a_customers: ["customers", "master"],
  a_label: ["product_labels", "detail"],
  a_order: ["orders", "transaction"],
  a_packages: ["packages", "master"],
  a_products: ["products", "master"],
  b_adscostweekly: ["advertising_costs", "transaction"],
  b_costmonthly: ["monthly_costs", "transaction"],
  b_deliveryschedule: ["deliveries", "transaction"],
  b_deliveryschedule_surcharge: ["delivery_surcharges", "detail"],
  b_product_ingredients: ["order_bom_requirements", "detail"],
  b_supplierpurchase: ["supplier_purchases", "transaction"],
  bento_mainingredients: ["bento_main_ingredients", "lookup"],
  bento_maintype: ["bento_main_types", "lookup"],
  bento_numberofcolumn: ["bento_column_types", "lookup"],
  bento_specialrequest: ["bento_special_requests", "lookup"],
  cal_control: ["production_calculations", "transaction"],
  cal_package_choice: ["order_package_choice_snapshots", "detail"],
  ds__ingredient_supplier: ["suppliers", "master"],
  ds_bento_additionalitem: ["bento_additional_items", "lookup"],
  ds_bento_eventpart: ["bento_event_parts", "lookup"],
  ds_channel: ["channels", "lookup"],
  ds_collection: ["product_collections", "lookup"],
  ds_cooktype: ["cook_types", "lookup"],
  ds_cost_type: ["cost_types", "lookup"],
  ds_customer_tag: ["customer_tags", "lookup"],
  ds_customer_tag_type: ["customer_tag_types", "lookup"],
  ds_deliverydistrict: ["delivery_districts", "lookup"],
  ds_deliverysurcharge: ["delivery_surcharge_types", "lookup"],
  ds_festival: ["festivals", "lookup"],
  ds_ingredients: ["ingredients", "master"],
  ds_packing: ["packing_materials", "master"],
  ds_paymentmethod: ["payment_methods", "lookup"],
  ds_purchasetype: ["purchase_types", "lookup"],
  ds_quote_delivery: ["quote_delivery_templates", "lookup"],
  ds_quote_payment: ["quote_payment_templates", "lookup"],
  "ds_quote_t&c": ["quote_terms_templates", "lookup"],
  ds_salespartner: ["sales_partners", "master"],
  ds_shippingmethod: ["shipping_methods", "lookup"],
  ds_super_motorcade_subdriver: ["delivery_team_drivers", "master"],
  ds_tags: ["product_tags", "lookup"],
  ds_type: ["product_types", "lookup"],
  dsao_blockdate: ["order_block_dates", "lookup"],
  dsaoproduct: ["channel_products", "junction"],
  "dscommuchannels(quote)": ["quote_communication_channels", "lookup"],
  "dsreminderperson(first)": ["quote_first_reminder_contacts", "lookup"],
  "dsreminderperson(second)": ["quote_second_reminder_contacts", "lookup"],
  "dssourceofsales(quote)": ["quote_sales_sources", "lookup"],
  ds_status: ["order_statuses", "lookup"],
  ds_super_motorcade: ["delivery_teams", "master"],
  m_cal_to_kg: ["meat_unit_conversions", "lookup"],
  "m_calculation%": ["meat_calculation_settings", "lookup"],
  m_customer: ["meat_customers", "master"],
  m_donemeat: ["prepared_meat_items", "master"],
  m_donemeat_stock: ["prepared_meat_stock_movements", "transaction"],
  m_meatseasoning_cost: ["meat_seasoning_cost_versions", "transaction"],
  m_monthly_meatprice: ["meat_price_versions", "transaction"],
  m_outdone_donemeat: ["meat_order_lines", "detail"],
  m_outdone_order: ["meat_orders", "transaction"],
  m_raw_stock: ["raw_meat_stock_movements", "transaction"],
  m_rawmeat: ["raw_meat_items", "master"],
  m_seasoning: ["seasonings", "master"],
  m_shippingmethod: ["meat_shipping_methods", "lookup"],
  nos_ordertag: ["order_tags", "lookup"],
  osdriver_menu: ["osdriver_menus", "lookup"],
  print_label: ["print_labels", "detail"],
  quote_bento_additionalitem: ["order_bento_additional_items", "detail"],
  quote_bento_eventpart: ["order_bento_event_parts", "detail"],
  quote_file: ["quote_file_metadata", "metadata"],
  quote_paymentmethod: ["order_payment_method_snapshots", "detail"],
  "quote_t&c": ["order_terms_snapshots", "detail"],
  s_comment: ["order_timeline_entries", "detail"],
  s_customer_tag: ["customer_tag_assignments", "junction"],
  s_ingredient_stocktake: ["ingredient_stocktake_events", "detail"],
  s_ingredients_product: ["product_ingredients", "junction"],
  s_order: ["order_lines", "detail"],
  s_packages_choiceset: ["package_choice_sets", "detail"],
  s_packages_product: ["package_products", "junction"],
  s_packing_stocktake: ["packing_stocktake_events", "detail"],
  s_payment: ["payments", "transaction"],
  s_paymentreport: ["payment_settlements", "transaction"],
  shop_dailysales: ["restaurant_daily_sales", "transaction"],
  shop_ds_holiday: ["restaurant_holidays", "lookup"],
  shop_ds_new_product: ["restaurant_new_products", "master"],
  shop_ds_restro_depart: ["restaurant_departments", "lookup"],
  shop_ds_staff_list: ["restaurant_staff", "master"],
  shop_ds_time_slot: ["restaurant_time_slots", "lookup"],
  shop_dscost: ["restaurant_costs", "master"],
  shop_dscost_type: ["restaurant_cost_types", "lookup"],
  shop_dspaymentmethod: ["restaurant_payment_methods", "lookup"],
  shop_dsrestro_period: ["restaurant_service_periods", "lookup"],
  shop_food_deli_platform: ["restaurant_delivery_platforms", "lookup"],
  shop_ingredients: ["restaurant_ingredients", "master"],
  shop_monthly_cost: ["restaurant_monthly_costs", "transaction"],
  shop_roster: ["restaurant_rosters", "transaction"],
  shop_stocktake: ["restaurant_stocktake_events", "transaction"],
  shop_supplier_purchase: ["restaurant_supplier_purchases", "transaction"],
  shopds_purchasetype: ["restaurant_purchase_types", "lookup"],
  shopdsrestro: ["restaurants", "master"],
};

const issueSummary = {
  b_product_ingredients: { issueCount: 1, affectedRows: 5 },
  m_donemeat_stock: { issueCount: 17, affectedRows: 18 },
  s_customer_tag: { issueCount: 1, affectedRows: 1 },
};

const targetSuggestions = {
  b_deliveryschedule_surcharge: "delivery_surcharges",
  cal_control: "production_calculations",
  cal_package_choice: "order_package_choice_snapshots",
  m_customer: "meat_customers",
  m_donemeat: "prepared_meat_items",
  m_donemeat_stock: "prepared_meat_stock_movements",
  m_meatseasoning_cost: "meat_seasoning_cost_versions",
  m_monthly_meatprice: "meat_price_versions",
  m_outdone_donemeat: "meat_order_lines",
  m_outdone_order: "meat_orders",
  m_raw_stock: "raw_meat_stock_movements",
  m_rawmeat: "raw_meat_items",
  m_seasoning: "seasonings",
  s_comment: "order_timeline_entries",
  s_ingredient_stocktake: "ingredient_stocktake_events",
  s_packages_choiceset: "package_choice_sets",
  s_packing_stocktake: "packing_stocktake_events",
  s_paymentreport: "payment_settlements",
  shop_dailysales: "restaurant_daily_sales",
  shop_ingredients: "restaurant_ingredients",
  shop_monthly_cost: "restaurant_monthly_costs",
  shop_roster: "restaurant_rosters",
  shop_stocktake: "restaurant_stocktake_events",
  shop_supplier_purchase: "restaurant_supplier_purchases",
};

function suggestedTarget(type) {
  if (targetSuggestions[type]) return targetSuggestions[type];
  if (type.startsWith("quote_")) return `order_${type.slice(6)}`;
  if (type.startsWith("shop_") || type.startsWith("shopds")) {
    return `restaurant_${type.replace(/^shop_?/, "").replace(/^ds_?/, "")}`;
  }
  if (
    type.startsWith("ds") ||
    type.startsWith("bento_") ||
    type.startsWith("dssource") ||
    type.startsWith("nos_")
  ) {
    return `lookup_${type.replaceAll("%", "percent")}`;
  }
  return `pending_${type.replaceAll("%", "percent")}`;
}

function suggestedStrategy(type) {
  if (type.startsWith("s_") || type.startsWith("quote_")) return "detail";
  if (type.startsWith("ds") || type.startsWith("bento_")) return "lookup";
  if (type.startsWith("m_") || type.startsWith("shop_")) return "transaction";
  return "pending_design";
}

const entities = manifest.exports
  .map((item) => {
    const mapping = completed[item.type];
    const issues = issueSummary[item.type];
    const status =
      item.type === "a_order"
        ? "reconciliation_required"
        : issues
          ? "complete_with_issues"
          : mapping
            ? "complete"
            : "not_started";
    const migrated = mapping ? item.records : 0;
    return {
      sourceType: item.type,
      sourceCount: item.records,
      targetTable: mapping?.[0] ?? suggestedTarget(item.type),
      strategy: mapping?.[1] ?? suggestedStrategy(item.type),
      status,
      migratedCount: migrated,
      remainingCount: item.records - migrated,
      issueCount: issues?.issueCount ?? 0,
      affectedRows: issues?.affectedRows ?? 0,
      rate: item.records === 0 ? (mapping ? 1 : 0) : migrated / item.records,
    };
  })
  .sort((a, b) => a.sourceType.localeCompare(b.sourceType));

const totals = entities.reduce(
  (result, entity) => {
    result.sourceRecords += entity.sourceCount;
    result.migratedRecords += entity.migratedCount;
    result.remainingRecords += entity.remainingCount;
    result.issueCount += entity.issueCount;
    result.affectedRows += entity.affectedRows;
    if (entity.status !== "not_started") result.mappedEntities += 1;
    return result;
  },
  {
    entities: entities.length,
    mappedEntities: 0,
    sourceRecords: 0,
    migratedRecords: 0,
    remainingRecords: 0,
    issueCount: 0,
    affectedRows: 0,
  },
);

await writeFile(
  "src/data/migration-entity-status.generated.json",
  `${JSON.stringify(
    {
      snapshotAt: manifest.snapshotAt,
      generatedFrom: "Supabase main verified phases A-S3",
      totals: {
        ...totals,
        tableRate: totals.mappedEntities / totals.entities,
        recordRate: totals.migratedRecords / totals.sourceRecords,
      },
      entities,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Generated ${totals.mappedEntities}/${totals.entities} mappings and ` +
    `${totals.migratedRecords}/${totals.sourceRecords} migrated records.`,
);
