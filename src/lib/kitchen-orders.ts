import {
  isOrderDelivered,
  isOrderPickedUp,
  type OrderStatusFilter,
} from "@/lib/orders";

export const KITCHEN_ORDERS_FROM = "kitchen";

export type KitchenOrderStatusFilter = Exclude<
  OrderStatusFilter,
  "confirmed"
>;

export const KITCHEN_STATUS_FILTERS: KitchenOrderStatusFilter[] = [
  "",
  "preparing",
  "ready",
  "pickedUp",
  "awaitingDriver",
  "shipping",
  "completed",
];

export type KitchenOperationalStatus = Exclude<KitchenOrderStatusFilter, "">;

export function kitchenOperationalStatus(order: {
  deliveryStatus: string | null;
  isSentToFactory?: boolean | null;
}): KitchenOperationalStatus {
  if (isOrderDelivered(order.deliveryStatus)) return "completed";
  if (order.deliveryStatus === "送貨途中") return "shipping";
  if (order.deliveryStatus === "待取貨") return "ready";
  if (isOrderPickedUp(order.deliveryStatus)) return "pickedUp";
  if (order.deliveryStatus === "待接單") return "awaitingDriver";
  return "preparing";
}

export function kitchenOperationalStatusTone(status: KitchenOperationalStatus) {
  if (status === "completed" || status === "ready" || status === "pickedUp") {
    return "green";
  }
  if (status === "preparing") return "amber";
  return "blue";
}

export function kitchenOrderHref(orderId: string) {
  return `/orders/${orderId}?from=${KITCHEN_ORDERS_FROM}`;
}

export function kitchenOrdersReturnPath(from: string | null | undefined) {
  return from === KITCHEN_ORDERS_FROM ? "/kitchen" : null;
}
