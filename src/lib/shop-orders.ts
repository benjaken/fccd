import { supabase } from "@/lib/supabase";
import {
  resolveWhatsAppCallStatus,
  type WhatsAppCallStatus,
} from "@/lib/shop-whatsapp-call";

export const TKO_RESTAURANT_ID = "67ea658e-627a-4d62-a90c-58ea5cf7e3dc";

export type ShopOrderChannel = "external" | "fc_internal";
export type ShopWarehouse = "frozen" | "dry" | null;

export type ShopCatalogItem = {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  supplierName: string;
  channel: ShopOrderChannel;
  warehouse: ShopWarehouse;
  fccSupplierId: string | null;
  sortOrder: number;
};

export type ShopCatalogSupplier = {
  supplierName: string;
  channel: ShopOrderChannel;
  fccSupplierId: string | null;
  items: ShopCatalogItem[];
};

export function shopCatalogSupplierKey(
  supplier: Pick<ShopCatalogSupplier, "supplierName" | "channel" | "fccSupplierId">,
) {
  return [supplier.channel, supplier.fccSupplierId ?? "unlinked", supplier.supplierName].join(":");
}

export type ShopSupplierContact = {
  id: string;
  supplierId: string;
  name: string | null;
  phone: string;
  note: string | null;
};

export type ShopOrderLineInput = {
  catalogItemId: string;
  quantity: number;
  note?: string;
};

export function buildSupplierOrderMessage(input: {
  restaurantName: string;
  requestNo: string;
  supplierName: string;
  deliveryDate: string;
  note?: string;
  lines: Array<{ name: string; unit: string; quantity: number }>;
}) {
  return [
    `你好，以下為 ${input.restaurantName} 的訂貨：`,
    `訂單編號：${input.requestNo}`,
    `送貨日期：${input.deliveryDate}`,
    `供應商：${input.supplierName}`,
    "",
    ...input.lines.map((line) => `- ${line.name} × ${line.quantity} ${line.unit}`),
    ...(input.note?.trim() ? ["", `備註：${input.note.trim()}`] : []),
    "",
    "請確認收到，謝謝。",
  ].join("\n");
}

export type ShopOrderRequest = {
  id: string;
  requestNo: string;
  restaurantId: string;
  restaurantName: string | null;
  channel: ShopOrderChannel;
  supplierId: string | null;
  catalogSupplierName: string;
  deliveryDate: string;
  status: string;
  note: string | null;
  contactPhone: string | null;
  whatsappCallStatus: WhatsAppCallStatus | null;
  whatsappCalledAt: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    name: string;
    unit: string;
    sku: string | null;
    quantity: number;
    warehouse: ShopWarehouse;
  }>;
};

type CatalogRow = {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  supplier_name: string;
  channel: ShopOrderChannel;
  warehouse: ShopWarehouse;
  fcc_supplier_id: string | null;
  sort_order: number;
};

type ContactRow = {
  id: string;
  supplier_id: string;
  name: string | null;
  phone: string;
  note: string | null;
};

type RequestRow = {
  id: string;
  request_no: string;
  restaurant_id: string;
  channel: ShopOrderChannel;
  supplier_id: string | null;
  catalog_supplier_name: string;
  delivery_date: string;
  status: string;
  note: string | null;
  contact_phone: string | null;
  whatsapp_call_status: WhatsAppCallStatus | null;
  whatsapp_called_at: string | null;
  created_at: string;
  restaurants: { name: string } | { name: string }[] | null;
  shop_order_lines: Array<{
    id: string;
    name: string;
    unit: string;
    sku: string | null;
    quantity: number;
    warehouse: ShopWarehouse;
  }> | null;
};

function mapCatalog(row: CatalogRow): ShopCatalogItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    supplierName: row.supplier_name,
    channel: row.channel,
    warehouse: row.warehouse,
    fccSupplierId: row.fcc_supplier_id,
    sortOrder: row.sort_order,
  };
}

export function groupCatalogBySupplier(items: ShopCatalogItem[]): ShopCatalogSupplier[] {
  const groups = new Map<string, ShopCatalogSupplier>();
  for (const item of items) {
    const key = shopCatalogSupplierKey(item);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(key, {
      supplierName: item.supplierName,
      channel: item.channel,
      fccSupplierId: item.fccSupplierId,
      items: [item],
    });
  }
  return [...groups.values()];
}

export function isDeliveryDateAllowed(deliveryDate: string, today: string) {
  return Boolean(deliveryDate) && deliveryDate >= today;
}

function restaurantName(row: RequestRow) {
  const restaurant = row.restaurants;
  if (Array.isArray(restaurant)) return restaurant[0]?.name ?? null;
  return restaurant?.name ?? null;
}

function mapRequest(row: RequestRow): ShopOrderRequest {
  return {
    id: row.id,
    requestNo: row.request_no,
    restaurantId: row.restaurant_id,
    restaurantName: restaurantName(row),
    channel: row.channel,
    supplierId: row.supplier_id,
    catalogSupplierName: row.catalog_supplier_name,
    deliveryDate: row.delivery_date,
    status: row.status,
    note: row.note,
    contactPhone: row.contact_phone,
    whatsappCallStatus: row.whatsapp_call_status,
    whatsappCalledAt: row.whatsapp_called_at,
    createdAt: row.created_at,
    lines: (row.shop_order_lines ?? []).map((line) => ({
      id: line.id,
      name: line.name,
      unit: line.unit,
      sku: line.sku,
      quantity: Number(line.quantity),
      warehouse: line.warehouse,
    })),
  };
}

const REQUEST_SELECT =
  "id,request_no,restaurant_id,channel,supplier_id,catalog_supplier_name,delivery_date,status,note,contact_phone,whatsapp_call_status,whatsapp_called_at,created_at,restaurants(name),shop_order_lines(id,name,unit,sku,quantity,warehouse)";

export async function fetchShopCatalog() {
  const { data, error } = await supabase
    .from("shop_catalog_items")
    .select("id,sku,name,unit,supplier_name,channel,warehouse,fcc_supplier_id,sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("supplier_name")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as CatalogRow[]).map(mapCatalog);
}

export async function fetchShopContacts(supplierId: string) {
  const { data, error } = await supabase
    .from("shop_supplier_contacts")
    .select("id,supplier_id,name,phone,note")
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as ContactRow[]).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    phone: row.phone,
    note: row.note,
  }));
}

export async function fetchShopOrderRequests(filters?: {
  restaurantId?: string;
  channel?: ShopOrderChannel | "";
}) {
  let query = supabase
    .from("shop_order_requests")
    .select(REQUEST_SELECT)
    .order("created_at", { ascending: false });
  if (filters?.restaurantId) query = query.eq("restaurant_id", filters.restaurantId);
  if (filters?.channel) query = query.eq("channel", filters.channel);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RequestRow[]).map(mapRequest);
}

export async function createShopOrderRequest(input: {
  restaurantId: string;
  channel: ShopOrderChannel;
  supplierId: string | null;
  catalogSupplierName: string;
  deliveryDate: string;
  note?: string;
  contactId?: string | null;
  contactPhone?: string | null;
  lines: ShopOrderLineInput[];
  catalogItems: ShopCatalogItem[];
}) {
  const itemsById = new Map(input.catalogItems.map((item) => [item.id, item]));
  const lines = input.lines
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const item = itemsById.get(line.catalogItemId);
      if (!item) throw new Error("Unknown catalog item");
      return {
        catalog_item_id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantity: line.quantity,
        note: line.note ?? null,
        warehouse: item.warehouse,
      };
    });
  if (!lines.length) throw new Error("Need at least one line");

  const status =
    input.channel === "external" ? "saved" : "submitted";

  const { data, error } = await supabase
    .from("shop_order_requests")
    .insert({
      restaurant_id: input.restaurantId,
      channel: input.channel,
      supplier_id: input.supplierId,
      catalog_supplier_name: input.catalogSupplierName,
      delivery_date: input.deliveryDate,
      status,
      note: input.note?.trim() || null,
      contact_id: input.contactId ?? null,
      contact_phone: input.contactPhone ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: lineError } = await supabase.from("shop_order_lines").insert(
    lines.map((line) => ({ ...line, request_id: data.id })),
  );
  if (lineError) throw lineError;

  const { data: created, error: reloadError } = await supabase
    .from("shop_order_requests")
    .select(REQUEST_SELECT)
    .eq("id", data.id)
    .single();
  if (reloadError) throw reloadError;
  return mapRequest(created as RequestRow);
}

export async function markShopOrderWhatsAppCall(requestId: string, phone: string | null) {
  const status = resolveWhatsAppCallStatus(phone);
  const { data, error } = await supabase
    .from("shop_order_requests")
    .update({
      whatsapp_call_status: status,
      whatsapp_called_at: status === "whatsapp_call_opened" ? new Date().toISOString() : null,
      contact_phone: phone,
      status: status === "whatsapp_call_opened" ? "whatsapp_call_opened" : status,
    })
    .eq("id", requestId)
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return mapRequest(data as RequestRow);
}

export async function updateShopOrderLines(
  requestId: string,
  lines: Array<{ id: string; quantity: number }>,
) {
  for (const line of lines) {
    const { error } = await supabase
      .from("shop_order_lines")
      .update({ quantity: line.quantity })
      .eq("id", line.id)
      .eq("request_id", requestId);
    if (error) throw error;
  }
}

export async function sendShopOrderToFactory(requestId: string) {
  const { data, error } = await supabase
    .from("shop_order_requests")
    .update({ status: "sent_to_factory" })
    .eq("id", requestId)
    .eq("channel", "fc_internal")
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return mapRequest(data as RequestRow);
}
