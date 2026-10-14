import { portalRpc as rpc } from "@/lib/customer-portal-rpc";

export type GroupCalendarOpening = {
  organization_id: string;
  organization_name: string;
  menu_id: string;
  menu_name: string;
  brand: string;
  delivery_date: string;
  valid_until: string;
};

export type OrderBlackout = { blackout_on: string; name: string };

export type GroupCalendarMonth = {
  blackouts: OrderBlackout[];
  openings: GroupCalendarOpening[];
};

export const listGroupCalendar = (from: string, to: string) =>
  rpc<GroupCalendarMonth>("customer_portal_ops_list_group_calendar", { p_from: from, p_to: to });

export const setOrderBlackout = (day: string, name: string, remove = false) =>
  rpc<void>("customer_portal_ops_set_order_blackout", { p_day: day, p_name: name, p_remove: remove });

export async function listPortalOrderBlackouts(organizationId?: string) {
  const rows = await rpc<OrderBlackout[]>("customer_portal_list_order_blackouts", undefined, organizationId);
  return Array.isArray(rows) ? rows : [];
}
