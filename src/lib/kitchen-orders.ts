export const KITCHEN_ORDERS_FROM = "kitchen";

export function kitchenOrderHref(orderId: string) {
  return `/orders/${orderId}?from=${KITCHEN_ORDERS_FROM}`;
}

export function kitchenOrdersReturnPath(from: string | null | undefined) {
  return from === KITCHEN_ORDERS_FROM ? "/kitchen" : null;
}
