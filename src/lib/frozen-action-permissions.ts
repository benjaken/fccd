export const FROZEN_ACTION_PERMISSION_KEYS = {
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
} as const;

export const FROZEN_ACTION_PAGE_KEYS = [
  FROZEN_ACTION_PERMISSION_KEYS.seasoningCost.edit,
  FROZEN_ACTION_PERMISSION_KEYS.seasoningCost.delete,
  FROZEN_ACTION_PERMISSION_KEYS.spiceUsage.delete,
  FROZEN_ACTION_PERMISSION_KEYS.calculationSettings.delete,
  FROZEN_ACTION_PERMISSION_KEYS.meatCustomers.edit,
  FROZEN_ACTION_PERMISSION_KEYS.meatCustomers.delete,
] as const;
