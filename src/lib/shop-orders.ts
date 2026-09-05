import { supabase } from "@/lib/supabase";
import {
  resolveWhatsAppCallStatus,
  type WhatsAppCallStatus,
} from "@/lib/shop-whatsapp-call";
import {
  fetchSuppliers,
  type SupplierFilters,
  type SupplierRow,
} from "@/lib/suppliers";

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
  batchId?: string | null;
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
    catalogItemId: string | null;
    name: string;
    unit: string;
    sku: string | null;
    quantity: number;
    warehouse: ShopWarehouse;
  }>;
  supplierOrders?: ShopOrderRequest[];
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

export type ShopOrderEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ShopSupplierContactInput = {
  supplierId: string;
  name: string;
  phone: string;
  note: string;
};

function mapContact(row: ContactRow): ShopSupplierContact {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    phone: row.phone,
    note: row.note,
  };
}

type RequestRow = {
  id: string;
  order_batch_id: string | null;
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
  shop_order_batches: { order_no: string } | { order_no: string }[] | null;
  shop_order_lines: Array<{
    id: string;
    catalog_item_id: string | null;
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
  const batch = Array.isArray(row.shop_order_batches)
    ? row.shop_order_batches[0]
    : row.shop_order_batches;
  return {
    id: row.id,
    batchId: row.order_batch_id,
    requestNo: batch?.order_no ?? row.request_no,
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
      catalogItemId: line.catalog_item_id,
      name: line.name,
      unit: line.unit,
      sku: line.sku,
      quantity: Number(line.quantity),
      warehouse: line.warehouse,
    })),
  };
}

const REQUEST_SELECT =
  "id,order_batch_id,request_no,restaurant_id,channel,supplier_id,catalog_supplier_name,delivery_date,status,note,contact_phone,whatsapp_call_status,whatsapp_called_at,created_at,restaurants(name),shop_order_batches(order_no),shop_order_lines(id,catalog_item_id,name,unit,sku,quantity,warehouse)";

export function canRestaurantEditShopOrder(request: Pick<ShopOrderRequest, "channel" | "status">) {
  return request.channel === "fc_internal" && ["submitted", "rejected"].includes(request.status);
}

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
  return ((data ?? []) as ContactRow[]).map(mapContact);
}

export async function fetchAllShopContacts() {
  const { data, error } = await supabase
    .from("shop_supplier_contacts")
    .select("id,supplier_id,name,phone,note")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as ContactRow[]).map(mapContact);
}

function shopContactWriteFields(input: ShopSupplierContactInput) {
  return {
    supplier_id: input.supplierId,
    name: input.name.trim() || null,
    phone: input.phone.trim(),
    note: input.note.trim() || null,
    is_active: true,
  };
}

export async function createShopSupplierContact(
  input: ShopSupplierContactInput,
) {
  const { data, error } = await supabase
    .from("shop_supplier_contacts")
    .insert(shopContactWriteFields(input))
    .select("id,supplier_id,name,phone,note")
    .single();
  if (error) throw error;
  return mapContact(data as ContactRow);
}

export async function updateShopSupplierContact(
  contactId: string,
  input: ShopSupplierContactInput,
) {
  const { data, error } = await supabase
    .from("shop_supplier_contacts")
    .update(shopContactWriteFields(input))
    .eq("id", contactId)
    .select("id,supplier_id,name,phone,note")
    .single();
  if (error) throw error;
  return mapContact(data as ContactRow);
}

export async function fetchShopOrderRequests(filters?: {
  requestId?: string;
  batchId?: string;
  restaurantId?: string;
  channel?: ShopOrderChannel | "";
}) {
  let query = supabase
    .from("shop_order_requests")
    .select(REQUEST_SELECT)
    .order("created_at", { ascending: false });
  if (filters?.requestId) query = query.eq("id", filters.requestId);
  if (filters?.batchId) query = query.eq("order_batch_id", filters.batchId);
  if (filters?.restaurantId) query = query.eq("restaurant_id", filters.restaurantId);
  if (filters?.channel) query = query.eq("channel", filters.channel);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RequestRow[]).map(mapRequest);
}

export function groupShopOrderRecords(requests: ShopOrderRequest[]) {
  const groups = new Map<string, ShopOrderRequest[]>();
  for (const request of requests) {
    const key = request.batchId ?? request.id;
    groups.set(key, [...(groups.get(key) ?? []), request]);
  }
  return [...groups.entries()].map(([batchId, supplierOrders]) => {
    const primary = supplierOrders.find((row) => row.channel === "fc_internal")
      ?? supplierOrders[0];
    const supplierNames = [...new Set(supplierOrders.map((row) => row.catalogSupplierName))];
    return {
      ...primary,
      id: batchId,
      batchId,
      catalogSupplierName: supplierNames.join("、"),
      lines: supplierOrders.flatMap((row) => row.lines),
      supplierOrders,
    } satisfies ShopOrderRequest;
  });
}

export async function fetchShopOrderRecords(filters?: { restaurantId?: string }) {
  return groupShopOrderRecords(await fetchShopOrderRequests(filters));
}

export async function createShopOrderBatch(input: {
  restaurantId: string;
  deliveryDate: string;
  note?: string;
  groups: Array<{
    channel: ShopOrderChannel;
    supplierId: string | null;
    catalogSupplierName: string;
    contactId?: string | null;
    contactPhone?: string | null;
    lines: ShopOrderLineInput[];
    catalogItems: ShopCatalogItem[];
  }>;
}) {
  const groups = input.groups.map((group) => {
    const itemsById = new Map(group.catalogItems.map((item) => [item.id, item]));
    const lines = group.lines.filter((line) => line.quantity > 0).map((line) => {
      const item = itemsById.get(line.catalogItemId);
      if (!item) throw new Error("Unknown catalog item");
      return { catalogItemId: item.id, quantity: line.quantity };
    });
    if (!lines.length) throw new Error("Need at least one line");
    return {
      channel: group.channel,
      supplierId: group.supplierId,
      supplierName: group.catalogSupplierName,
      contactId: group.contactId ?? null,
      contactPhone: group.contactPhone ?? null,
      lines,
    };
  });
  const { data, error } = await supabase.rpc("shop_create_order_batch", {
    p_restaurant_id: input.restaurantId,
    p_delivery_date: input.deliveryDate,
    p_note: input.note?.trim() || null,
    p_groups: groups,
  });
  if (error) throw error;
  return fetchShopOrderRequests({ batchId: String(data) });
}

export async function createShopOrderRequest(input: {
  batchId?: string | null;
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
      order_batch_id: input.batchId ?? null,
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
  const { error } = await supabase.rpc("shop_review_order_lines", {
    p_request_id: requestId,
    p_lines: lines,
  });
  if (error) throw error;
}

export async function fetchShopOrderEvents(requestId: string) {
  const { data, error } = await supabase
    .from("shop_order_events")
    .select("id,event_type,payload,created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventType: row.event_type as string,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  })) satisfies ShopOrderEvent[];
}

export async function reviewShopOrder(input: {
  requestId: string;
  deliveryDate: string;
  note: string;
  reviewNote: string;
  action: "save" | "approve" | "return";
  lines: Array<{ catalogItemId: string; quantity: number }>;
}) {
  const { error } = await supabase.rpc("shop_office_review_order", {
    p_request_id: input.requestId,
    p_delivery_date: input.deliveryDate,
    p_note: input.note.trim() || null,
    p_review_note: input.reviewNote.trim() || null,
    p_action: input.action,
    p_lines: input.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
    })),
  });
  if (error) throw error;
}

/**
 * Returns the supplier master records used by the restaurant order catalog.
 * Catalog labels remain visible as ordering groups, while all management
 * actions continue to target the shared FCCD supplier record.
 */
export async function fetchShopSupplierRecords(
  filters: SupplierFilters = {},
): Promise<SupplierRow[]> {
  const [catalog, suppliers] = await Promise.all([
    fetchShopCatalog(),
    fetchSuppliers({ status: filters.status }),
  ]);
  const groupsBySupplier = new Map<
    string,
    Array<{ name: string; channel: ShopOrderChannel; itemCount: number }>
  >();

  for (const group of groupCatalogBySupplier(catalog)) {
    if (!group.fccSupplierId) continue;
    const groups = groupsBySupplier.get(group.fccSupplierId) ?? [];
    groups.push({
      name: group.supplierName,
      channel: group.channel,
      itemCount: group.items.length,
    });
    groupsBySupplier.set(group.fccSupplierId, groups);
  }

  const search = filters.search?.trim().toLocaleLowerCase("zh-HK") ?? "";
  return suppliers
    .filter((supplier) => groupsBySupplier.has(supplier.id))
    .map((supplier) => ({
      ...supplier,
      orderingGroups: groupsBySupplier.get(supplier.id) ?? [],
    }))
    .filter((supplier) => {
      if (!search) return true;
      return [
        supplier.companyName,
        supplier.contactPerson,
        supplier.phoneNumber,
        ...(supplier.orderingGroups ?? []).map((group) => group.name),
      ].some((value) => value?.toLocaleLowerCase("zh-HK").includes(search));
    });
}

export async function updateSubmittedShopOrder(input: {
  requestId: string;
  deliveryDate: string;
  note: string;
  lines: Array<{ catalogItemId: string; quantity: number }>;
}) {
  const { error } = await supabase.rpc("shop_update_submitted_order", {
    p_request_id: input.requestId,
    p_delivery_date: input.deliveryDate,
    p_note: input.note.trim() || null,
    p_lines: input.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
    })),
  });
  if (error) throw error;
}

export async function withdrawSubmittedShopOrder(requestId: string) {
  const { error } = await supabase.rpc("shop_withdraw_submitted_order", {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export async function sendShopOrderToFactory(requestId: string) {
  const { error } = await supabase.rpc("shop_send_reviewed_order_to_factory", {
    p_request_id: requestId,
  });
  if (error) throw error;
}
