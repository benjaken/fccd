import { supabase } from "@/lib/supabase";
import {
  fetchOrderStatusCatalog,
  resolveOrderStatuses,
  type OrderStatusView,
} from "@/lib/order-statuses";

export type ReadOnlyOrderDetail = {
  id: string;
  documentType: "order" | "quote";
  channelId?: string | null;
  channelName?: string | null;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  email: string | null;
  contactA: string | null;
  contactB: string | null;
  address: string | null;
  customerNote: string | null;
  internalNote?: string | null;
  quoteStatus: string | null;
  quoteDescription: string | null;
  deliveryTerms: string | null;
  deliveryAt: string | null;
  deliveryTime?: string | null;
  shipOutTime: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
  factoryDate: string | null;
  factoryPackingNote: string | null;
  factoryPrintDate?: string | null;
  factoryReprintRequired?: boolean;
  currency: string;
  discount: number;
  shippingFee: number;
  grandTotal: number | null;
  outstanding: number | null;
  createdAt?: string | null;
  shopifyStoreDomain?: string | null;
  updatedAt: string;
  statuses: OrderStatusView[];
};

export type DetailLine = {
  id: string;
  sku: string | null;
  productId?: string | null;
  packageId?: string | null;
  productName: string | null;
  content: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  isAddon: boolean;
  remarks: string | null;
};

export type DetailDelivery = {
  id: string;
  deliveryAt: string | null;
  shipOutTime: string | null;
  status: string | null;
  confirmation: string | null;
  fulfilledAt: string | null;
  fee: number | null;
};

export type DetailPayment = {
  id: string;
  amount: number;
  currency: string;
  paymentAt: string | null;
  payoutAt: string | null;
  paymentMethod: string | null;
  reference: string | null;
  receiptReference?: string | null;
  receiptNumber?: string | null;
};

export type DetailTimeline = {
  id: string;
  category: string | null;
  comment: string;
  occurredAt: string;
};

export type QuoteFileMetadata = {
  id: string;
  displayName: string | null;
  sourceFileName: string | null;
  createdAt: string;
};

export type OrderDetailResult = {
  order: ReadOnlyOrderDetail | null;
  lines: DetailLine[];
  deliveries: DetailDelivery[];
  payments: DetailPayment[];
  timeline: DetailTimeline[];
  terms: string[];
  paymentMethods: string[];
  quoteFiles: QuoteFileMetadata[];
};

const fields =
  "id,document_type,order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,shipping_address_snapshot,customer_note_snapshot,remarks,quote_status,quote_description_snapshot,delivery_terms_snapshot,delivery_at,delivery_time,ship_out_time,delivery_status,is_sent_to_factory,factory_date,factory_packing_note,factory_print_date,factory_reprint_required,currency,discount_amount,shipping_fee,grand_total,outstanding,bubble_created_at,created_at,updated_at,order_status_legacy_ids,channels(id,name),shopify_stores(shop_domain)";

function decimal(value: string | number | null) {
  return value === null ? null : Number.parseFloat(String(value));
}

function firstNonEmptyText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function relatedCatalogText(
  relation: unknown,
  field: "name" | "sku" | "shop_domain",
): string | null {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row && typeof row === "object" && field in row
    ? firstNonEmptyText(row[field])
    : null;
}

function relatedCatalogId(relation: unknown): string | null {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row && typeof row === "object" && "id" in row
    ? firstNonEmptyText(row.id)
    : null;
}

export async function fetchOrderDetail(
  id: string,
  documentType: "order" | "quote",
  canViewFinance: boolean,
): Promise<OrderDetailResult> {
  const [{ data, error }, catalog] = await Promise.all([
    supabase
      .from("orders")
      .select(fields)
      .eq("id", id)
      .eq("document_type", documentType)
      .is("archived_at", null)
      .maybeSingle(),
    fetchOrderStatusCatalog(),
  ]);
  if (error) throw error;
  if (!data) {
    return {
      order: null,
      lines: [],
      deliveries: [],
      payments: [],
      timeline: [],
      terms: [],
      paymentMethods: [],
      quoteFiles: [],
    };
  }

  const [linesResult, deliveriesResult, timelineResult, termsResult, methodsResult, filesResult] =
    await Promise.all([
      supabase
        .from("order_lines")
        .select(
          "id,product_id,package_id,sku_snapshot,product_name_snapshot,content_snapshot,quantity,unit_price,total_price,is_addon,remarks_1,remarks_2,products(sku,name),packages(sku,name)",
        )
        .eq("order_id", id)
        .eq("is_void", false)
        .order("type_sort")
        .order("item_order"),
      documentType === "order"
        ? supabase
            .from("deliveries")
            .select(
              "id,delivery_at,ship_out_time,delivery_status,driver_confirmation_status,fulfilled_at,total_fee",
            )
            .eq("order_id", id)
            .order("delivery_at")
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("order_timeline_entries")
        .select("id,category,comment,bubble_created_at,created_at")
        .eq("order_id", id)
        .order("bubble_created_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("order_terms_snapshots")
        .select("content")
        .eq("order_id", id)
        .order("created_at"),
      supabase
        .from("order_payment_method_snapshots")
        .select("content")
        .eq("order_id", id)
        .order("created_at"),
      documentType === "quote"
        ? supabase
            .from("quote_file_metadata")
            .select("id,display_name,source_file_name,created_at")
            .eq("order_id", id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

  const results = [
    linesResult,
    deliveriesResult,
    timelineResult,
    termsResult,
    methodsResult,
    filesResult,
  ];
  for (const result of results) {
    if (result.error) throw result.error;
  }

  let payments: DetailPayment[] = [];
  if (canViewFinance && documentType === "order") {
    const { data: paymentRows, error: paymentError } = await supabase
      .from("payments")
      .select("id,amount,currency,payment_at,payout_at,paypal_reference,receipt_reference,payment_methods(name),payment_settlement_payments(payment_settlements(receipt_number))")
      .eq("order_id", id)
      .is("voided_at", null)
      .order("bubble_created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (paymentError) throw paymentError;
    payments = (paymentRows ?? []).map((row) => {
      const paymentMethod = row.payment_methods as { name: string } | { name: string }[] | null;
      const settlementLinks = (row.payment_settlement_payments ?? []) as unknown as Array<{
        payment_settlements: { receipt_number: string | null } | { receipt_number: string | null }[] | null;
      }>;
      const receiptNumber = settlementLinks
        .flatMap((link) => Array.isArray(link.payment_settlements) ? link.payment_settlements : link.payment_settlements ? [link.payment_settlements] : [])
        .map((settlement) => settlement.receipt_number?.trim() || "")
        .find(Boolean) || null;
      return {
        id: row.id,
        amount: Number(row.amount),
        currency: row.currency,
        paymentAt: row.payment_at,
        payoutAt: row.payout_at,
        paymentMethod: Array.isArray(paymentMethod) ? paymentMethod[0]?.name ?? null : paymentMethod?.name ?? null,
        reference: row.receipt_reference || row.paypal_reference,
        receiptReference: row.receipt_reference,
        receiptNumber,
      };
    });
  }

  const order = {
    id: data.id,
    documentType: data.document_type as "order" | "quote",
    channelId: relatedCatalogId(data.channels),
    channelName: relatedCatalogText(data.channels, "name"),
    orderNumber: data.order_number,
    customerName: data.customer_name_snapshot,
    companyName: data.company_name_snapshot,
    email: data.email_snapshot,
    contactA: data.contact_number_a_snapshot,
    contactB: data.contact_number_b_snapshot,
    address: data.shipping_address_snapshot,
    customerNote: data.customer_note_snapshot,
    internalNote: data.remarks,
    quoteStatus: data.quote_status,
    quoteDescription: data.quote_description_snapshot,
    deliveryTerms: data.delivery_terms_snapshot,
    deliveryAt: data.delivery_at,
    deliveryTime: data.delivery_time,
    shipOutTime: data.ship_out_time,
    deliveryStatus: data.delivery_status,
    isSentToFactory: data.is_sent_to_factory,
    factoryDate: data.factory_date,
    factoryPackingNote: data.factory_packing_note,
    factoryPrintDate: data.factory_print_date,
    factoryReprintRequired: Boolean(data.factory_reprint_required),
    currency: data.currency,
    discount: Number(data.discount_amount),
    shippingFee: Number(data.shipping_fee),
    grandTotal: canViewFinance ? decimal(data.grand_total) : null,
    outstanding: canViewFinance ? decimal(data.outstanding) : null,
    createdAt: data.bubble_created_at || data.created_at,
    shopifyStoreDomain: relatedCatalogText(data.shopify_stores, "shop_domain"),
    updatedAt: data.updated_at,
    statuses: resolveOrderStatuses(data.order_status_legacy_ids, catalog),
  } satisfies ReadOnlyOrderDetail;

  return {
    order,
    lines: (linesResult.data ?? []).map((row) => ({
      id: row.id,
      sku: firstNonEmptyText(
        row.sku_snapshot,
        relatedCatalogText(row.products, "sku"),
        relatedCatalogText(row.packages, "sku"),
      ),
      productId: row.product_id,
      packageId: row.package_id,
      productName: firstNonEmptyText(
        row.product_name_snapshot,
        relatedCatalogText(row.products, "name"),
        relatedCatalogText(row.packages, "name"),
      ),
      content: row.content_snapshot,
      quantity: decimal(row.quantity),
      unitPrice: canViewFinance ? decimal(row.unit_price) : null,
      totalPrice: canViewFinance ? decimal(row.total_price) : null,
      isAddon: row.is_addon,
      remarks: row.remarks_1 || row.remarks_2,
    })),
    deliveries: (deliveriesResult.data ?? []).map((row) => ({
      id: row.id,
      deliveryAt: row.delivery_at,
      shipOutTime: row.ship_out_time,
      status: row.delivery_status,
      confirmation: row.driver_confirmation_status,
      fulfilledAt: row.fulfilled_at,
      fee: canViewFinance ? decimal(row.total_fee) : null,
    })),
    payments,
    timeline: (timelineResult.data ?? []).map((row) => ({
      id: row.id,
      category: row.category,
      comment: row.comment,
      occurredAt: row.bubble_created_at || row.created_at,
    })),
    terms: (termsResult.data ?? []).flatMap((row) =>
      row.content ? [row.content] : [],
    ),
    paymentMethods: (methodsResult.data ?? []).flatMap((row) =>
      row.content ? [row.content] : [],
    ),
    quoteFiles: (filesResult.data ?? []).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      sourceFileName: row.source_file_name,
      createdAt: row.created_at,
    })),
  };
}
