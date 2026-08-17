export const ORDER_ACTION_PERMISSION_KEYS = {
  statuses: {
    create: "orders.settings.statuses.create",
    edit: "orders.settings.statuses.edit",
    delete: "orders.settings.statuses.delete",
  },
} as const;

export const ORDER_ACTION_PAGE_KEYS = [
  ORDER_ACTION_PERMISSION_KEYS.statuses.create,
  ORDER_ACTION_PERMISSION_KEYS.statuses.edit,
  ORDER_ACTION_PERMISSION_KEYS.statuses.delete,
] as const;
