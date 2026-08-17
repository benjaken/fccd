export const ORDER_ACTION_PERMISSION_KEYS = {
  statuses: {
    create: "orders.settings.statuses.create",
    edit: "orders.settings.statuses.edit",
    delete: "orders.settings.statuses.delete",
  },
  salePartners: {
    create: "orders.settings.sale_partners.create",
    edit: "orders.settings.sale_partners.edit",
    delete: "orders.settings.sale_partners.delete",
  },
} as const;

export const ORDER_ACTION_PAGE_KEYS = [
  ORDER_ACTION_PERMISSION_KEYS.statuses.create,
  ORDER_ACTION_PERMISSION_KEYS.statuses.edit,
  ORDER_ACTION_PERMISSION_KEYS.statuses.delete,
  ORDER_ACTION_PERMISSION_KEYS.salePartners.create,
  ORDER_ACTION_PERMISSION_KEYS.salePartners.edit,
  ORDER_ACTION_PERMISSION_KEYS.salePartners.delete,
] as const;
