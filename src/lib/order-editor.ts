import { supabase } from "@/lib/supabase";
import {
  normalizeDoNotSendToFactory,
  saveOrderFactorySettings,
} from "@/lib/order-factory-settings";

export type OrderEditorOption = {
  id: string;
  name: string;
  sku?: string | null;
  price?: number | null;
  kind?: "product" | "package";
};

export type OrderEditorLine = {
  id: string;
  productId: string | null;
  packageId: string | null;
  sku: string;
  name: string;
  remarks: string;
  quantity: number;
  unitPrice: number;
};

export type OrderEditorPayment = {
  id: string;
  paymentAt: string;
  paymentMethodId: string;
  amount: number;
  reference: string;
};

export type OrderEditorDraft = {
  id: string | null;
  orderNumber: string;
  channelId: string;
  customerName: string;
  companyName: string;
  contactA: string;
  contactB: string;
  email: string;
  address: string;
  customerNote: string;
  internalNote: string;
  factoryPackingNote: string;
  deliveryAt: string;
  deliveryTime: string;
  shipOutTime: string;
  shippingMethodId: string;
  districtId: string;
  salesPartnerId: string;
  shippingFee: number;
  discount: number;
  cashdollarRedeemed: number;
  cashdollarPurchased: number;
  doNotSendToFactory: boolean;
  suppressFactoryReprint: boolean;
  factoryPrintDate: string | null;
  originalFactoryReprintRequired: boolean;
  lines: OrderEditorLine[];
  payments: OrderEditorPayment[];
  deliveryId: string | null;
};

export type OrderEditorOptions = {
  channels: OrderEditorOption[];
  shippingMethods: OrderEditorOption[];
  districts: OrderEditorOption[];
  salesPartners: OrderEditorOption[];
  paymentMethods: OrderEditorOption[];
  catalog: OrderEditorOption[];
};

export type OrderEditorPayload = {
  draft: OrderEditorDraft;
  options: OrderEditorOptions;
};

export function emptyOrderDraft(): OrderEditorDraft {
  return {
    id: null,
    orderNumber: "",
    channelId: "",
    customerName: "",
    companyName: "",
    contactA: "",
    contactB: "",
    email: "",
    address: "",
    customerNote: "",
    internalNote: "",
    factoryPackingNote: "",
    deliveryAt: "",
    deliveryTime: "",
    shipOutTime: "",
    shippingMethodId: "",
    districtId: "",
    salesPartnerId: "",
    shippingFee: 0,
    discount: 0,
    cashdollarRedeemed: 0,
    cashdollarPurchased: 0,
    doNotSendToFactory: false,
    suppressFactoryReprint: false,
    factoryPrintDate: null,
    originalFactoryReprintRequired: false,
    lines: [],
    payments: [],
    deliveryId: null,
  };
}

function numberValue(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function generatedLegacyId(kind: string) {
  return `web-${kind}-${crypto.randomUUID()}`;
}

async function fetchOptions(): Promise<OrderEditorOptions> {
  const [channels, methods, districts, partners, payments, products, packages] =
    await Promise.all([
      supabase.from("channels").select("id,name").is("archived_at", null).eq("is_active", true).order("sort_order", { nullsFirst: false }).order("name"),
      supabase.from("shipping_methods").select("id,name,display_name").is("archived_at", null).eq("is_active", true).order("display_order", { nullsFirst: false }).order("name"),
      supabase.from("delivery_districts").select("id,name").is("archived_at", null).order("name"),
      supabase.from("sales_partners").select("id,name").eq("is_active", true).order("name"),
      supabase.from("payment_methods").select("id,name").is("archived_at", null).eq("is_active", true).order("name"),
      supabase.from("products").select("id,sku,name,chinese_name,price").is("archived_at", null).eq("is_active", true).not("sku", "is", null).order("sku").limit(300),
      supabase.from("packages").select("id,sku,name,chinese_name,price").is("archived_at", null).eq("is_active", true).not("sku", "is", null).order("sku").limit(200),
    ]);

  for (const result of [channels, methods, districts, partners, payments, products, packages]) {
    if (result.error) throw result.error;
  }

  const named = (rows: Array<{ id: string; name: string }> | null) =>
    (rows ?? []).map((row) => ({ id: row.id, name: row.name }));
  const catalog = [
    ...(products.data ?? []).map((row) => ({
      id: row.id,
      name: row.chinese_name || row.name,
      sku: row.sku,
      price: row.price === null ? null : numberValue(row.price),
      kind: "product" as const,
    })),
    ...(packages.data ?? []).map((row) => ({
      id: row.id,
      name: row.chinese_name || row.name,
      sku: row.sku,
      price: row.price === null ? null : numberValue(row.price),
      kind: "package" as const,
    })),
  ];

  return {
    channels: named(channels.data),
    shippingMethods: (methods.data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name || row.name,
    })),
    districts: named(districts.data),
    salesPartners: named(partners.data),
    paymentMethods: named(payments.data),
    catalog,
  };
}

export async function fetchOrderEditor(
  id?: string | null,
  copy = false,
): Promise<OrderEditorPayload> {
  const optionsPromise = fetchOptions();
  if (!id) return { draft: emptyOrderDraft(), options: await optionsPromise };

  const [orderResult, linesResult, paymentsResult, deliveryResult, options] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id,order_number,channel_id,customer_name_snapshot,company_name_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,email_snapshot,shipping_address_snapshot,customer_note_snapshot,remarks,factory_packing_note,delivery_at,delivery_time,ship_out_time,shipping_method_id,sales_partner_id,shipping_fee,discount_amount,cashdollar_redeemed,cashdollar_purchased,do_not_send_to_factory,factory_print_date,factory_reprint_required")
        .eq("id", id)
        .eq("document_type", "order")
        .is("archived_at", null)
        .maybeSingle(),
      supabase
        .from("order_lines")
        .select("id,product_id,package_id,sku_snapshot,product_name_snapshot,content_snapshot,quantity,unit_price,remarks_1")
        .eq("order_id", id)
        .eq("is_void", false)
        .order("type_sort")
        .order("item_order"),
      supabase
        .from("payments")
        .select("id,payment_at,payment_method_id,amount,receipt_reference,paypal_reference")
        .eq("order_id", id)
        .is("voided_at", null)
        .order("payment_at"),
      supabase
        .from("deliveries")
        .select("id,district_id")
        .eq("order_id", id)
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      optionsPromise,
    ]);

  for (const result of [orderResult, linesResult, paymentsResult, deliveryResult]) {
    if (result.error) throw result.error;
  }
  const row = orderResult.data;
  if (!row) throw new Error("order_not_found");

  const draft: OrderEditorDraft = {
    id: copy ? null : row.id,
    orderNumber: copy ? "" : row.order_number ?? "",
    channelId: row.channel_id ?? "",
    customerName: row.customer_name_snapshot ?? "",
    companyName: row.company_name_snapshot ?? "",
    contactA: row.contact_number_a_snapshot ?? "",
    contactB: row.contact_number_b_snapshot ?? "",
    email: row.email_snapshot ?? "",
    address: row.shipping_address_snapshot ?? "",
    customerNote: row.customer_note_snapshot ?? "",
    internalNote: row.remarks ?? "",
    factoryPackingNote: row.factory_packing_note ?? "",
    deliveryAt: localDateTime(row.delivery_at),
    deliveryTime: row.delivery_time ?? "",
    shipOutTime: row.ship_out_time ?? "",
    shippingMethodId: row.shipping_method_id ?? "",
    districtId: deliveryResult.data?.district_id ?? "",
    salesPartnerId: row.sales_partner_id ?? "",
    shippingFee: numberValue(row.shipping_fee),
    discount: numberValue(row.discount_amount),
    cashdollarRedeemed: numberValue(row.cashdollar_redeemed),
    cashdollarPurchased: numberValue(row.cashdollar_purchased),
    doNotSendToFactory: copy
      ? false
      : normalizeDoNotSendToFactory(row.do_not_send_to_factory),
    suppressFactoryReprint: false,
    factoryPrintDate: copy ? null : row.factory_print_date,
    originalFactoryReprintRequired: copy
      ? false
      : Boolean(row.factory_reprint_required),
    lines: (linesResult.data ?? []).map((line) => ({
      id: copy ? crypto.randomUUID() : line.id,
      productId: line.product_id,
      packageId: line.package_id,
      sku: line.sku_snapshot ?? "",
      name: line.product_name_snapshot || line.content_snapshot || "",
      remarks: line.remarks_1 ?? "",
      quantity: numberValue(line.quantity),
      unitPrice: numberValue(line.unit_price),
    })),
    payments: copy
      ? []
      : (paymentsResult.data ?? []).map((payment) => ({
          id: payment.id,
          paymentAt: localDateTime(payment.payment_at),
          paymentMethodId: payment.payment_method_id ?? "",
          amount: numberValue(payment.amount),
          reference: payment.receipt_reference || payment.paypal_reference || "",
        })),
    deliveryId: copy ? null : deliveryResult.data?.id ?? null,
  };
  return { draft, options };
}

export function orderDraftTotals(draft: OrderEditorDraft) {
  const subtotal = draft.lines.reduce(
    (sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice),
    0,
  );
  const total = Math.max(
    0,
    subtotal + draft.shippingFee - draft.discount - draft.cashdollarRedeemed,
  );
  const paid = draft.payments.reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  return { subtotal, total, paid, outstanding: Math.max(0, total - paid) };
}

export type OrderPaymentStatus = "unpaid" | "partial" | "paid";

export function orderPaymentStatus({
  total,
  paid,
  outstanding,
}: ReturnType<typeof orderDraftTotals>): OrderPaymentStatus {
  if (outstanding <= 0 && (total > 0 || paid > 0)) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

export async function saveOrderEditor(draft: OrderEditorDraft): Promise<string> {
  const totals = orderDraftTotals(draft);
  const orderId = draft.id ?? crypto.randomUUID();
  const requestedOrderNumber = nullable(draft.orderNumber);
  const orderValues = {
    order_number: requestedOrderNumber,
    document_type: "order",
    channel_id: nullable(draft.channelId),
    customer_name_snapshot: nullable(draft.customerName),
    company_name_snapshot: nullable(draft.companyName),
    contact_number_a_snapshot: nullable(draft.contactA),
    contact_number_b_snapshot: nullable(draft.contactB),
    email_snapshot: nullable(draft.email),
    shipping_address_snapshot: nullable(draft.address),
    customer_note_snapshot: nullable(draft.customerNote),
    remarks: nullable(draft.internalNote),
    factory_packing_note: nullable(draft.factoryPackingNote),
    delivery_at: toIso(draft.deliveryAt),
    delivery_time: nullable(draft.deliveryTime),
    ship_out_time: nullable(draft.shipOutTime),
    shipping_method_id: nullable(draft.shippingMethodId),
    sales_partner_id: nullable(draft.salesPartnerId),
    shipping_fee: draft.shippingFee,
    discount_amount: draft.discount,
    cashdollar_redeemed: draft.cashdollarRedeemed,
    cashdollar_purchased: draft.cashdollarPurchased,
    do_not_send_to_factory: draft.doNotSendToFactory,
    grand_total: totals.total,
    outstanding: totals.outstanding,
    updated_at: new Date().toISOString(),
  };

  const orderResult = draft.id
    ? await supabase.from("orders").update(orderValues).eq("id", orderId).select("id,order_number").single()
    : await supabase.from("orders").insert({
        id: orderId,
        legacy_id: generatedLegacyId("order"),
        is_sent_to_factory: false,
        ...orderValues,
      }).select("id,order_number").single();
  if (orderResult.error) throw orderResult.error;
  const savedOrderNumber = orderResult.data.order_number;
  if (!savedOrderNumber) throw new Error("order_number_assignment_failed");

  const { data: currentLines, error: currentLinesError } = await supabase
    .from("order_lines").select("id").eq("order_id", orderId).eq("is_void", false);
  if (currentLinesError) throw currentLinesError;
  const lineIds = new Set(draft.lines.map((line) => line.id));
  const removedLineIds = (currentLines ?? []).map((line) => line.id).filter((id) => !lineIds.has(id));
  if (removedLineIds.length) {
    const { error } = await supabase.from("order_lines").update({ is_void: true }).in("id", removedLineIds);
    if (error) throw error;
  }
  if (draft.lines.length) {
    const { error } = await supabase.from("order_lines").upsert(
      draft.lines.map((line, index) => ({
        id: line.id,
        legacy_id: generatedLegacyId("order-line"),
        order_id: orderId,
        product_id: line.productId,
        package_id: line.packageId,
        sku_snapshot: nullable(line.sku),
        product_name_snapshot: nullable(line.name),
        content_snapshot: nullable(line.name),
        remarks_1: nullable(line.remarks),
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total_price: line.quantity * line.unitPrice,
        item_order: index + 1,
        type_sort: line.packageId ? 2 : 1,
        is_void: false,
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  // The database trigger intentionally invalidates printed labels whenever an
  // order line changes. This one-save override restores the previous valid
  // print state only when the order was fully printed and did not already need
  // a reprint before this edit.
  await saveOrderFactorySettings(
    orderId,
    {
      doNotSendToFactory: draft.doNotSendToFactory,
      suppressFactoryReprint: draft.suppressFactoryReprint,
      factoryPrintDate: draft.factoryPrintDate,
      originalFactoryReprintRequired: draft.originalFactoryReprintRequired,
    },
  );

  const { data: currentPayments, error: currentPaymentsError } = await supabase
    .from("payments").select("id").eq("order_id", orderId).is("voided_at", null);
  if (currentPaymentsError) throw currentPaymentsError;
  const paymentIds = new Set(draft.payments.map((payment) => payment.id));
  const removedPaymentIds = (currentPayments ?? []).map((payment) => payment.id).filter((id) => !paymentIds.has(id));
  if (removedPaymentIds.length) {
    const { error } = await supabase.from("payments").update({ voided_at: new Date().toISOString() }).in("id", removedPaymentIds);
    if (error) throw error;
  }
  if (draft.payments.length) {
    const { error } = await supabase.from("payments").upsert(
      draft.payments.map((payment) => ({
        id: payment.id,
        legacy_id: generatedLegacyId("payment"),
        order_id: orderId,
        order_number_snapshot: savedOrderNumber,
        payment_method_id: nullable(payment.paymentMethodId),
        amount: payment.amount,
        currency: "HKD",
        payment_at: toIso(payment.paymentAt),
        receipt_reference: nullable(payment.reference),
        voided_at: null,
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  if (draft.deliveryAt || draft.deliveryId) {
    const deliveryValues = {
      order_id: orderId,
      district_id: nullable(draft.districtId),
      shipping_method_id: nullable(draft.shippingMethodId),
      delivery_at: toIso(draft.deliveryAt),
      delivery_time: nullable(draft.deliveryTime),
      ship_out_time: nullable(draft.shipOutTime),
      total_fee: draft.shippingFee,
    };
    const result = draft.deliveryId
      ? await supabase.from("deliveries").update(deliveryValues).eq("id", draft.deliveryId)
      : await supabase.from("deliveries").insert({
          id: crypto.randomUUID(),
          legacy_id: generatedLegacyId("delivery"),
          delivery_status: "未派車隊",
          ...deliveryValues,
        });
    if (result.error) throw result.error;
  }

  return orderId;
}
