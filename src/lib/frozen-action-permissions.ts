export const FROZEN_ACTION_PERMISSION_KEYS = {
  rawMeatInventory: {
    create: "frozen.raw_meat_inventory.create",
    edit: "frozen.raw_meat_inventory.edit",
    stockIn: "frozen.raw_meat_inventory.stock_in",
  },
  seasoningCost: {
    edit: "frozen.seasoning_cost.edit",
    delete: "frozen.seasoning_cost.delete",
  },
  meatCustomers: {
    edit: "frozen.meat_customers.edit",
    delete: "frozen.meat_customers.delete",
  },
  spiceUsage: {
    delete: "frozen.spice_usage.delete",
  },
  calculationSettings: {
    delete: "frozen.calculation_settings.delete",
  },
  sellingPriceCost: {
    push: "frozen.selling_price_cost.push",
  },
  supplierQuotes: {
    upload: "frozen.supplier_quotes.upload",
    review: "frozen.supplier_quotes.review",
    export: "frozen.supplier_quotes.export",
    settings: "frozen.supplier_quotes.settings",
  },
} as const;

export const FROZEN_ACTION_PAGE_KEYS = [
  FROZEN_ACTION_PERMISSION_KEYS.rawMeatInventory.create,
  FROZEN_ACTION_PERMISSION_KEYS.rawMeatInventory.edit,
  FROZEN_ACTION_PERMISSION_KEYS.rawMeatInventory.stockIn,
  FROZEN_ACTION_PERMISSION_KEYS.seasoningCost.edit,
  FROZEN_ACTION_PERMISSION_KEYS.seasoningCost.delete,
  FROZEN_ACTION_PERMISSION_KEYS.spiceUsage.delete,
  FROZEN_ACTION_PERMISSION_KEYS.calculationSettings.delete,
  FROZEN_ACTION_PERMISSION_KEYS.meatCustomers.edit,
  FROZEN_ACTION_PERMISSION_KEYS.meatCustomers.delete,
  FROZEN_ACTION_PERMISSION_KEYS.sellingPriceCost.push,
  FROZEN_ACTION_PERMISSION_KEYS.supplierQuotes.upload,
  FROZEN_ACTION_PERMISSION_KEYS.supplierQuotes.review,
  FROZEN_ACTION_PERMISSION_KEYS.supplierQuotes.export,
  FROZEN_ACTION_PERMISSION_KEYS.supplierQuotes.settings,
] as const;
