import { supabase } from "@/lib/supabase";

export type ReadOnlyOrderDetail = {
  id: string;
  documentType: "order" | "quote";
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  email: string | null;
  contactA: string | null;
  contactB: string | null;
  address: string | null;
  customerNote: string | null;
  quoteStatus: string | null;
  quoteDescription: string | null;
  deliveryTerms: string | null;
  deliveryAt: string | null;
  shipOutTime: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
  factoryDate: string | null;
  factoryPackingNote: string | null;
  currency: string;
  discount: number;
  shippingFee: number;
  grandTotal: number | null;
  outstanding: number | null;
  updatedAt: string;
};

export type DetailLine = {
  id: string;
  sku: string | null;
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
  "id,document_type,order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,shipping_address_snapshot,customer_note_snapshot,quote_status,quote_description_snapshot,delivery_terms_snapshot,delivery_at,ship_out_time,delivery_status,is_sent_to_factory,factory_date,factory_packing_note,currency,discount_amount,shipping_fee,grand_total,outstanding,updated_at";

function decimal(value: string | number | null) {
  return value === null ? null : Number.parseFloat(String(value));
}

export async function fetchOrderDetail(
  id: string,
  documentType: "order" | "quote",
  canViewFinance: boolean,
): Promise<OrderDetailResult> {
  const { data, error } = await supabase
    .from("orders")
    .select(fields)
    .eq("id", id)
    .eq("document_type", documentType)
    .is("archived_at", null)
    .maybeSingle();
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
          "id,sku_snapshot,product_name_snapshot,content_snapshot,quantity,unit_price,total_price,is_addon,remarks_1,remarks_2",
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
        .order("created_at", { ascending: false }),
      documentType === "quote"
        ? supabase
            .from("order_terms_snapshots")
            .select("content")
            .eq("order_id", id)
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
      documentType === "quote"
        ? supabase
            .from("order_payment_method_snapshots")
            .select("content")
            .eq("order_id", id)
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
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
      .select("id,amount,currency,payment_at,payout_at,paypal_reference,receipt_reference")
      .eq("order_id", id)
      .is("voided_at", null)
      .order("payment_at", { ascending: false });
    if (paymentError) throw paymentError;
    payments = (paymentRows ?? []).map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      currency: row.currency,
      paymentAt: row.payment_at,
      payoutAt: row.payout_at,
      paymentMethod: null,
      reference: row.receipt_reference || row.paypal_reference,
    }));
  }

  const order = {
    id: data.id,
    documentType: data.document_type as "order" | "quote",
    orderNumber: data.order_number,
    customerName: data.customer_name_snapshot,
    companyName: data.company_name_snapshot,
    email: data.email_snapshot,
    contactA: data.contact_number_a_snapshot,
    contactB: data.contact_number_b_snapshot,
    address: data.shipping_address_snapshot,
    customerNote: data.customer_note_snapshot,
    quoteStatus: data.quote_status,
    quoteDescription: data.quote_description_snapshot,
    deliveryTerms: data.delivery_terms_snapshot,
    deliveryAt: data.delivery_at,
    shipOutTime: data.ship_out_time,
    deliveryStatus: data.delivery_status,
    isSentToFactory: data.is_sent_to_factory,
    factoryDate: data.factory_date,
    factoryPackingNote: data.factory_packing_note,
    currency: data.currency,
    discount: Number(data.discount_amount),
    shippingFee: Number(data.shipping_fee),
    grandTotal: canViewFinance ? decimal(data.grand_total) : null,
    outstanding: canViewFinance ? decimal(data.outstanding) : null,
    updatedAt: data.updated_at,
  } satisfies ReadOnlyOrderDetail;

  return {
    order,
    lines: (linesResult.data ?? []).map((row) => ({
      id: row.id,
      sku: row.sku_snapshot,
      productName: row.product_name_snapshot,
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
