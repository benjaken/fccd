import { supabase } from "@/lib/supabase";
import { safeSearchTerm } from "@/lib/deliveries";

export const DRIVER_ASSIGNMENTS_PAGE_SIZE = 15;

export type DriverAssignmentItem = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  deliveryAt: string | null;
  deliveryTime: string | null;
  deliveryStatus: string | null;
  motorcadeId: string | null;
  motorcadeName: string | null;
  driverName: string | null;
};

export type DeliveryTeamOption = { id: string; name: string };

type Nested<T> = T | T[] | null | undefined;

function first<T>(value: Nested<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function fetchUnassignedDriverDeliveries({
  page,
  search,
  teamId,
}: {
  page: number;
  search: string;
  teamId: string;
}) {
  const start = (page - 1) * DRIVER_ASSIGNMENTS_PAGE_SIZE;
  const end = start + DRIVER_ASSIGNMENTS_PAGE_SIZE - 1;
  let query = supabase
    .from("deliveries")
    .select(
      "id,delivery_at,delivery_time,ship_out_time,delivery_status,motorcade_id,orders!inner(order_number,customer_name_snapshot,delivery_time,delivery_status),delivery_teams!motorcade_id(name,short_name)",
      { count: "exact" },
    )
    .not("order_id", "is", null)
    .is("subdriver_id", null)
    .in("delivery_status", ["未派車隊", "待取貨"]);
  if (teamId) query = query.eq("motorcade_id", teamId);
  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,shipping_address_snapshot.ilike.%${term}%`,
      { referencedTable: "orders" },
    );
  }
  const { data, count, error } = await query
    .order("delivery_at", { ascending: false, nullsFirst: false })
    .order("delivery_time", { ascending: false, nullsFirst: false })
    .order("ship_out_time", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);
  if (error) throw error;

  return {
    items: (data ?? []).map((row) => {
      const order = first(
        row.orders as
          | {
              order_number: string | null;
              customer_name_snapshot: string | null;
              delivery_time: string | null;
              delivery_status: string | null;
            }
          | Array<{
              order_number: string | null;
              customer_name_snapshot: string | null;
              delivery_time: string | null;
              delivery_status: string | null;
            }>
          | null,
      );
      const team = first(
        row.delivery_teams as
          | { name: string | null; short_name: string | null }
          | Array<{ name: string | null; short_name: string | null }>
          | null,
      );
      return {
        id: row.id as string,
        orderNumber: order?.order_number ?? null,
        customerName: order?.customer_name_snapshot ?? null,
        deliveryAt: row.delivery_at as string | null,
        deliveryTime:
          (row.delivery_time as string | null) ??
          (row.ship_out_time as string | null) ??
          order?.delivery_time ??
          null,
        deliveryStatus:
          (row.delivery_status as string | null) ??
          order?.delivery_status ??
          null,
        motorcadeId: row.motorcade_id as string | null,
        motorcadeName: team?.name ?? team?.short_name ?? null,
        driverName: null,
      } satisfies DriverAssignmentItem;
    }),
    total: count ?? 0,
  };
}

export async function fetchDeliveryAssignmentOptions() {
  const teamsResult = await supabase
    .from("delivery_teams")
    .select("id,name,short_name")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("name");
  if (teamsResult.error) throw teamsResult.error;

  return {
    teams: (teamsResult.data ?? []).map((row) => ({
      id: row.id as string,
      name:
        (row.name as string | null)?.trim() ||
        (row.short_name as string | null)?.trim() ||
        (row.id as string),
    })),
  };
}

export async function assignDeliveryTeam(
  deliveryId: string,
  teamId: string,
) {
  const { error } = await supabase.rpc("assign_delivery_motorcade", {
    p_delivery_id: deliveryId,
    p_motorcade_id: teamId,
  });
  if (error) throw error;
}
