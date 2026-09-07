import { supabase } from "@/lib/supabase";
import { TKO_RESTAURANT_ID } from "@/lib/shop-orders";
import { fetchShopShipments, type ShopShipment } from "@/lib/shop-warehouse";

export type ShopReceiveStatus = "received" | "exception";

export type PendingShopReceiveGroup = {
  key: string;
  orderNo: string;
  shippedAt: string;
  shipments: ShopShipment[];
};

export type ShopReceive = {
  id: string;
  receiveNo: string;
  shipmentId: string;
  requestId: string;
  status: ShopReceiveStatus;
  receivedAt: string;
  note: string | null;
  lines: Array<{
    id: string;
    name: string;
    unit: string;
    shippedQuantity: number;
    receivedQuantity: number;
    variance: number;
  }>;
  exceptions: Array<{
    id: string;
    name: string | null;
    expectedQuantity: number;
    receivedQuantity: number;
    variance: number;
    reason: string;
  }>;
};

export function isReceiveQuantityAllowed(received: number) {
  return Number.isFinite(received) && received >= 0;
}

export function hasReceiveVariance(shipped: number, received: number) {
  return Number(shipped) !== Number(received);
}

export function receiveStatusForLines(
  lines: Array<{ shippedQuantity: number; receivedQuantity: number }>,
): ShopReceiveStatus {
  return lines.some((line) => hasReceiveVariance(line.shippedQuantity, line.receivedQuantity))
    ? "exception"
    : "received";
}

export function groupPendingShopReceives(
  shipments: ShopShipment[],
): PendingShopReceiveGroup[] {
  const groups = new Map<string, ShopShipment[]>();
  for (const shipment of shipments) {
    const key = shipment.requestNo ?? shipment.shipmentNo;
    groups.set(key, [...(groups.get(key) ?? []), shipment]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    orderNo: rows[0]?.requestNo ?? rows[0]?.shipmentNo ?? key,
    shippedAt: rows.map((row) => row.shippedAt).sort().at(-1) ?? "",
    shipments: rows,
  }));
}

export async function fetchPendingShopReceives(restaurantId = TKO_RESTAURANT_ID) {
  return fetchShopShipments({ restaurantId, status: "in_transit" });
}

export async function fetchShopReceives(restaurantId = TKO_RESTAURANT_ID) {
  const { data, error } = await supabase
    .from("shop_receives")
    .select(
      "id,receive_no,shipment_id,request_id,status,received_at,note,shop_receive_lines(id,name,unit,shipped_quantity,received_quantity,variance),shop_receive_exceptions(id,receive_line_id,expected_quantity,received_quantity,variance,reason)",
    )
    .eq("restaurant_id", restaurantId)
    .order("received_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string;
    receive_no: string;
    shipment_id: string;
    request_id: string;
    status: ShopReceiveStatus;
    received_at: string;
    note: string | null;
    shop_receive_lines: Array<{
      id: string;
      name: string;
      unit: string;
      shipped_quantity: number | string;
      received_quantity: number | string;
      variance: number | string;
    }> | null;
    shop_receive_exceptions: Array<{
      id: string;
      receive_line_id: string;
      expected_quantity: number | string;
      received_quantity: number | string;
      variance: number | string;
      reason: string;
    }> | null;
  }>).map((row) => {
    const lines = (row.shop_receive_lines ?? []).map((line) => ({
      id: line.id,
      name: line.name,
      unit: line.unit,
      shippedQuantity: Number(line.shipped_quantity),
      receivedQuantity: Number(line.received_quantity),
      variance: Number(line.variance),
    }));
    const names = new Map(lines.map((line) => [line.id, line.name]));
    return {
      id: row.id,
      receiveNo: row.receive_no,
      shipmentId: row.shipment_id,
      requestId: row.request_id,
      status: row.status,
      receivedAt: row.received_at,
      note: row.note,
      lines,
      exceptions: (row.shop_receive_exceptions ?? []).map((item) => ({
        id: item.id,
        name: names.get(item.receive_line_id) ?? null,
        expectedQuantity: Number(item.expected_quantity),
        receivedQuantity: Number(item.received_quantity),
        variance: Number(item.variance),
        reason: item.reason,
      })),
    };
  });
}

export async function receiveShopShipment(
  shipment: ShopShipment,
  lines: Array<{ shipmentLineId: string; receivedQuantity: number; reason?: string }>,
  note: string | undefined,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc("receive_shop_shipment", {
    p_shipment_id: shipment.id,
    p_lines: lines.map((line) => ({
      shipment_line_id: line.shipmentLineId,
      received_quantity: line.receivedQuantity,
      reason: line.reason ?? null,
    })),
    p_note: note ?? null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data as { id: string; receiveNo: string; status: ShopReceiveStatus; replayed: boolean };
}
