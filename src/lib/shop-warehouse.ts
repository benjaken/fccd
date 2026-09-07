import { supabase } from "@/lib/supabase";
import {
  fetchShopOrderRequests,
  formatShopOrderNumber,
  type ShopCatalogItem,
  type ShopOrderRequest,
  type ShopWarehouse,
} from "@/lib/shop-orders";

export const FACTORY_WAREHOUSE_VISIBLE_STATUSES = [
  "sent_to_factory",
  "in_transit",
  "shipped",
  "received",
  "exception",
] as const;

export type ShopStockWarning = "ok" | "missing" | "low" | "unmapped";

export type ShopWarehouseReceipt = {
  id: string;
  receiptNo: string;
  warehouse: Exclude<ShopWarehouse, null>;
  name: string;
  unit: string;
  sku: string | null;
  quantity: number;
  sourceName: string | null;
  batchNo: string | null;
  receiptDate: string;
  stockWarning: ShopStockWarning;
  createdAt: string;
};

export type ShopShipment = {
  id: string;
  shipmentNo: string;
  requestId: string;
  requestNo: string | null;
  restaurantName: string | null;
  status: string;
  shippedAt: string;
  warningFlags: string[];
  lines: Array<{
    id: string;
    name: string;
    unit: string;
    shippedQuantity: number;
    approvedQuantity: number;
    stockWarning: ShopStockWarning;
  }>;
};

export function isFactoryWarehouseVisible(status: string) {
  return (FACTORY_WAREHOUSE_VISIBLE_STATUSES as readonly string[]).includes(status);
}

export function isShipQuantityAllowed(shipped: number, approved: number) {
  return Number.isFinite(shipped) && shipped > 0 && shipped <= approved;
}

export function parseKgPerUnit(unit: string) {
  const match = unit.match(/(\d+(?:\.\d+)?)\s*(kg|公斤)/i);
  return match ? Number(match[1]) : null;
}

export function estimateMovementKg(quantity: number, unit: string) {
  const perUnit = parseKgPerUnit(unit);
  return perUnit == null ? quantity : quantity * perUnit;
}

export function resolveStockWarning(input: {
  mapped: boolean;
  hasLedger: boolean;
  balance: number;
  quantity: number;
}): ShopStockWarning {
  if (!input.mapped) return "unmapped";
  if (!input.hasLedger) return "missing";
  if (input.balance < input.quantity) return "low";
  return "ok";
}

export function canShipWithWarning(warning: ShopStockWarning) {
  return warning === "ok" || warning === "missing" || warning === "low" || warning === "unmapped";
}

type ReceiptRow = {
  id: string;
  receipt_no: string;
  warehouse: "frozen" | "dry";
  name: string;
  unit: string;
  sku: string | null;
  quantity: number | string;
  source_name: string | null;
  batch_no: string | null;
  receipt_date: string;
  stock_warning: ShopStockWarning;
  created_at: string;
};

type ShipmentRow = {
  id: string;
  shipment_no: string;
  request_id: string;
  status: string;
  shipped_at: string;
  warning_flags: string[] | null;
  shop_order_requests:
    | { request_no: string; shop_order_batches: { order_no: string } | { order_no: string }[] | null; restaurants: { name: string } | { name: string }[] | null }
    | { request_no: string; shop_order_batches: { order_no: string } | { order_no: string }[] | null; restaurants: { name: string } | { name: string }[] | null }[]
    | null;
  shop_shipment_lines: Array<{
    id: string;
    name: string;
    unit: string;
    shipped_quantity: number | string;
    approved_quantity: number | string;
    stock_warning: ShopStockWarning;
  }> | null;
};

function restaurantName(
  restaurants: { name: string } | { name: string }[] | null | undefined,
) {
  if (Array.isArray(restaurants)) return restaurants[0]?.name ?? null;
  return restaurants?.name ?? null;
}

export async function fetchFactoryPendingShopOrders() {
  const rows = await fetchShopOrderRequests({ channel: "fc_internal" });
  return rows.filter((row) => row.status === "sent_to_factory");
}

export async function fetchShopWarehouseReceipts() {
  const { data, error } = await supabase
    .from("shop_warehouse_receipts")
    .select(
      "id,receipt_no,warehouse,name,unit,sku,quantity,source_name,batch_no,receipt_date,stock_warning,created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ReceiptRow[]).map((row) => ({
    id: row.id,
    receiptNo: row.receipt_no,
    warehouse: row.warehouse,
    name: row.name,
    unit: row.unit,
    sku: row.sku,
    quantity: Number(row.quantity),
    sourceName: row.source_name,
    batchNo: row.batch_no,
    receiptDate: row.receipt_date,
    stockWarning: row.stock_warning,
    createdAt: row.created_at,
  }));
}

export async function fetchShopShipments(filters?: {
  restaurantId?: string;
  status?: string;
}) {
  let query = supabase
    .from("shop_shipments")
    .select(
      "id,shipment_no,request_id,status,shipped_at,warning_flags,shop_order_requests(request_no,shop_order_batches(order_no),restaurants(name)),shop_shipment_lines(id,name,unit,shipped_quantity,approved_quantity,stock_warning)",
    )
    .order("shipped_at", { ascending: false });
  if (filters?.restaurantId) query = query.eq("restaurant_id", filters.restaurantId);
  if (filters?.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ShipmentRow[]).map((row) => {
    const request = Array.isArray(row.shop_order_requests)
      ? row.shop_order_requests[0]
      : row.shop_order_requests;
    return {
      id: row.id,
      shipmentNo: row.shipment_no,
      requestId: row.request_id,
      requestNo: request
        ? formatShopOrderNumber(
            (Array.isArray(request.shop_order_batches)
              ? request.shop_order_batches[0]?.order_no
              : request.shop_order_batches?.order_no) ?? request.request_no,
          )
        : null,
      restaurantName: restaurantName(request?.restaurants),
      status: row.status,
      shippedAt: row.shipped_at,
      warningFlags: row.warning_flags ?? [],
      lines: (row.shop_shipment_lines ?? []).map((line) => ({
        id: line.id,
        name: line.name,
        unit: line.unit,
        shippedQuantity: Number(line.shipped_quantity),
        approvedQuantity: Number(line.approved_quantity),
        stockWarning: line.stock_warning,
      })),
    };
  });
}

export async function assessShopWarehouseRequest(
  requestId: string,
  lines: Array<{ requestLineId: string; quantity: number }>,
) {
  const { data, error } = await supabase.rpc("assess_shop_warehouse_request", {
    p_request_id: requestId,
    p_lines: lines.map((line) => ({
      request_line_id: line.requestLineId,
      quantity: line.quantity,
    })),
  });
  if (error) throw error;
  const payload = data as { lines?: Array<{ requestLineId: string; warning: ShopStockWarning }> };
  return payload?.lines ?? [];
}

export async function recordShopWarehouseReceipt(input: {
  catalogItem: ShopCatalogItem;
  quantity: number;
  receiptDate: string;
  sourceName?: string;
  batchNo?: string;
  idempotencyKey: string;
}) {
  const { data, error } = await supabase.rpc("record_shop_warehouse_receipt", {
    p_catalog_item_id: input.catalogItem.id,
    p_quantity: input.quantity,
    p_receipt_date: input.receiptDate,
    p_supplier_id: input.catalogItem.fccSupplierId,
    p_source_name: input.sourceName ?? input.catalogItem.supplierName,
    p_batch_no: input.batchNo ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data as { id: string; receiptNo: string; warning: ShopStockWarning; replayed: boolean };
}

export async function shipShopOrderRequest(
  request: ShopOrderRequest,
  lines: Array<{ requestLineId: string; quantity: number }>,
) {
  const { data, error } = await supabase.rpc("ship_shop_order_request", {
    p_request_id: request.id,
    p_lines: lines.map((line) => ({
      request_line_id: line.requestLineId,
      quantity: line.quantity,
    })),
  });
  if (error) throw error;
  return data as { id: string; shipmentNo: string; warnings: string[]; replayed: boolean };
}
