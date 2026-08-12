import { readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(
    ".migration-data/full-snapshot/export-manifest.json",
    "utf8",
  ),
);

const completed = {
  a_customers: ["customers", "master"],
  a_order: ["orders", "transaction"],
  a_packages: ["packages", "master"],
  a_products: ["products", "master"],
  b_deliveryschedule: ["deliveries", "transaction"],
  b_product_ingredients: ["order_bom_requirements", "detail"],
  ds__ingredient_supplier: ["suppliers", "master"],
  ds_channel: ["channels", "lookup"],
  ds_deliverydistrict: ["delivery_districts", "lookup"],
  ds_ingredients: ["ingredients", "master"],
  ds_packing: ["packing_materials", "master"],
  ds_paymentmethod: ["payment_methods", "lookup"],
  ds_shippingmethod: ["shipping_methods", "lookup"],
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
  s_ingredient_stocktake: ["ingredient_stocktake_events", "detail"],
  s_ingredients_product: ["product_ingredients", "junction"],
  s_order: ["order_lines", "detail"],
  s_packages_product: ["package_products", "junction"],
  s_packing_stocktake: ["packing_stocktake_events", "detail"],
  s_payment: ["payments", "transaction"],
  shop_ds_restro_depart: ["restaurant_departments", "lookup"],
  shopdsrestro: ["restaurants", "master"],
};

const issueSummary = {
  b_product_ingredients: { issueCount: 1, affectedRows: 5 },
  m_donemeat_stock: { issueCount: 17, affectedRows: 18 },
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
      rate: item.records === 0 ? (mapping ? 100 : 0) : migrated / item.records,
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
      generatedFrom: "Supabase main verified phases A-D2",
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
