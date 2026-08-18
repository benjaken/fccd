export const KITCHEN_SETTINGS_PAGE_KEY = "kitchen.settings";
export const COOK_TYPE_PAGE_KEY = "kitchen.settings.cook_types";
export const KITCHEN_SUPPLIERS_PAGE_KEY = "kitchen.suppliers";
export const KITCHEN_SUPPLIERS_VIEW_DETAIL = "kitchen.suppliers.view_detail";

export const KITCHEN_ACTION_PERMISSION_KEYS = {
  cookTypes: {
    delete: "kitchen.settings.cook_types.delete",
  },
  suppliers: {
    viewDetail: KITCHEN_SUPPLIERS_VIEW_DETAIL,
  },
} as const;

export const KITCHEN_ACTION_PAGE_KEYS = [
  KITCHEN_SETTINGS_PAGE_KEY,
  COOK_TYPE_PAGE_KEY,
  KITCHEN_ACTION_PERMISSION_KEYS.cookTypes.delete,
  KITCHEN_SUPPLIERS_PAGE_KEY,
  KITCHEN_SUPPLIERS_VIEW_DETAIL,
] as const;
