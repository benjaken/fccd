import { supabase } from "@/lib/supabase";

export type QuoteEditorOption = {
  id: string;
  name: string;
};

export type QuoteEditorOptions = {
  channels: QuoteEditorOption[];
  quoteSalesSources: QuoteEditorOption[];
  quoteCommunicationChannels: QuoteEditorOption[];
  districts: QuoteEditorOption[];
  shippingMethods: QuoteEditorOption[];
  salesPartners: QuoteEditorOption[];
  orderTags: QuoteEditorOption[];
  paymentMethods: QuoteEditorOption[];
};

export type QuotePayment = {
  id: string;
  paymentAt: string;
  paymentMethodId: string;
  amount: number;
  reference: string;
};

export type QuoteDraft = {
  channelId: string;
  quoteStatus: string;
  quoteSalesSourceId: string;
  quoteCommunicationChannelId: string;
  customerName: string;
  companyName: string;
  contactA: string;
  contactB: string;
  email: string;
  asanaLink: string;
  address: string;
  districtId: string;
  districtName: string;
  shippingMethodId: string;
  deliveryDate: string;
  deliveryTime: string;
  shipOutTime: string;
  customerNote: string;
  packingNote: string;
  salesPartnerId: string;
  internalNote: string;
  tagIds: string[];
};

export type CreatedQuote = {
  id: string;
  orderNumber: string;
};

export type QuoteEditorSummary = CreatedQuote & {
  channelId: string;
  draft: QuoteDraft;
  financials: QuoteFinancials;
  payments: QuotePayment[];
};

export type QuoteFinancials = {
  shippingFee: number;
  discount: number;
  cashdollarRedeemed: number;
  cashdollarPurchased: number;
};

export type QuoteCatalogItem = {
  id: string;
  kind: "product" | "package";
  sku: string | null;
  name: string;
  price: number | null;
};

export type QuoteLine = {
  id: string;
  productId: string | null;
  packageId: string | null;
  sku: string | null;
  name: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  remarks: string | null;
};

type NamedRow = { id: string; name: string };
type ShippingRow = { id: string; name: string; display_name: string | null };

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dedupeQuoteOptions(items: QuoteEditorOption[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLocaleLowerCase("zh-HK");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchQuoteEditorOptions(): Promise<QuoteEditorOptions> {
  const [channels, quoteSalesSources, quoteCommunicationChannels, districts, shippingMethods, salesPartners, orderTags, paymentMethods] =
    await Promise.all([
      supabase.from("channels").select("id,name").eq("is_active", true).is("archived_at", null).order("sort_order", { nullsFirst: false }).order("name"),
      supabase.from("quote_sales_sources").select("id,name").eq("is_active", true).order("name"),
      supabase.from("quote_communication_channels").select("id,name").eq("is_active", true).order("name"),
      supabase.from("delivery_districts").select("id,name").is("archived_at", null).order("name"),
      supabase.from("shipping_methods").select("id,name,display_name").eq("is_active", true).is("archived_at", null).order("display_order", { nullsFirst: false }).order("name"),
      supabase.from("sales_partners").select("id,name").eq("is_active", true).order("name"),
      supabase.from("order_tags").select("id,name").eq("is_active", true).is("archived_at", null).order("name"),
      supabase.from("payment_methods").select("id,name").eq("is_active", true).order("name"),
    ]);

  const error = [channels, quoteSalesSources, quoteCommunicationChannels, districts, shippingMethods, salesPartners, orderTags, paymentMethods]
    .map((result) => result.error)
    .find(Boolean);
  if (error) throw error;

  return {
    channels: (channels.data ?? []) as NamedRow[],
    quoteSalesSources: (quoteSalesSources.data ?? []) as NamedRow[],
    quoteCommunicationChannels: (quoteCommunicationChannels.data ?? []) as NamedRow[],
    districts: dedupeQuoteOptions((districts.data ?? []) as NamedRow[]),
    shippingMethods: ((shippingMethods.data ?? []) as ShippingRow[]).map((row) => ({
      id: row.id,
      name: row.display_name || row.name,
    })),
    salesPartners: (salesPartners.data ?? []) as NamedRow[],
    orderTags: (orderTags.data ?? []) as NamedRow[],
    paymentMethods: (paymentMethods.data ?? []) as NamedRow[],
  };
}

export async function createQuote(input: QuoteDraft): Promise<CreatedQuote> {
  const { data, error } = await supabase.rpc("create_quote", {
    p_channel_id: input.channelId || null,
    p_customer_name: optional(input.customerName),
    p_company_name: optional(input.companyName),
    p_contact_a: optional(input.contactA),
    p_contact_b: optional(input.contactB),
    p_email: optional(input.email),
    p_address: optional(input.address),
    p_district_id: input.districtId || null,
    p_district_name: optional(input.districtName),
    p_shipping_method_id: input.shippingMethodId || null,
    p_delivery_date: input.deliveryDate || null,
    p_delivery_time: optional(input.deliveryTime),
    p_ship_out_time: optional(input.shipOutTime),
    p_customer_note: optional(input.customerNote),
    p_packing_note: optional(input.packingNote),
    p_sales_partner_id: input.salesPartnerId || null,
    p_internal_note: optional(input.internalNote),
    p_order_tag_ids: input.tagIds,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id || !row?.order_number) throw new Error("quote_create_failed");
  const { error: workflowError } = await supabase
    .from("orders")
    .update(quoteWorkflowValues(input))
    .eq("id", row.id);
  if (workflowError) throw workflowError;
  const { data: saved, error: savedError } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", row.id)
    .single();
  if (savedError || !saved?.order_number) throw savedError || new Error("quote_create_failed");
  return { id: row.id as string, orderNumber: saved.order_number as string };
}

export async function duplicateQuote(
  sourceId: string,
  input: QuoteDraft,
): Promise<CreatedQuote> {
  const { data, error } = await supabase.rpc("duplicate_quote", {
    p_source_id: sourceId,
    p_channel_id: input.channelId || null,
    p_customer_name: optional(input.customerName),
    p_company_name: optional(input.companyName),
    p_contact_a: optional(input.contactA),
    p_contact_b: optional(input.contactB),
    p_email: optional(input.email),
    p_address: optional(input.address),
    p_district_id: input.districtId || null,
    p_district_name: optional(input.districtName),
    p_shipping_method_id: input.shippingMethodId || null,
    p_delivery_date: input.deliveryDate || null,
    p_delivery_time: optional(input.deliveryTime),
    p_ship_out_time: optional(input.shipOutTime),
    p_customer_note: optional(input.customerNote),
    p_packing_note: optional(input.packingNote),
    p_sales_partner_id: input.salesPartnerId || null,
    p_internal_note: optional(input.internalNote),
    p_order_tag_ids: input.tagIds,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id || !row?.order_number) throw new Error("quote_copy_failed");
  const { error: workflowError } = await supabase
    .from("orders")
    .update(quoteWorkflowValues(input))
    .eq("id", row.id);
  if (workflowError) throw workflowError;
  return { id: row.id as string, orderNumber: row.order_number as string };
}

export async function fetchQuoteEditorSummary(orderId: string): Promise<QuoteEditorSummary | null> {
  const [orderResult, deliveryResult, tagsResult, asanaResult, paymentsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id,order_number,channel_id,quote_status,quote_sales_source_id,quote_communication_channel_id,customer_name_snapshot,company_name_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,email_snapshot,shipping_address_snapshot,customer_note_snapshot,shipping_method_id,delivery_at,delivery_time,ship_out_time,factory_packing_note,sales_partner_id,remarks,shipping_fee,discount_amount,cashdollar_redeemed,cashdollar_purchased")
      .eq("id", orderId)
      .in("document_type", ["quote", "unconfirmed"])
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("deliveries")
      .select("id,district_id")
      .eq("order_id", orderId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("order_tag_assignments")
      .select("order_tag_id")
      .eq("order_id", orderId),
    supabase
      .from("orders")
      .select("asana_link")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("id,payment_at,payment_method_id,amount,receipt_reference,paypal_reference")
      .eq("order_id", orderId)
      .is("voided_at", null)
      .order("payment_at"),
  ]);
  if (orderResult.error) throw orderResult.error;
  const data = orderResult.data;
  if (!data) return null;
  const draft: QuoteDraft = {
    channelId: data.channel_id || "",
    quoteStatus: data.quote_status || "",
    quoteSalesSourceId: data.quote_sales_source_id || "",
    quoteCommunicationChannelId: data.quote_communication_channel_id || "",
    customerName: data.customer_name_snapshot || "",
    companyName: data.company_name_snapshot || "",
    contactA: data.contact_number_a_snapshot || "",
    contactB: data.contact_number_b_snapshot || "",
    email: data.email_snapshot || "",
    asanaLink: asanaResult.error ? "" : asanaResult.data?.asana_link || "",
    address: data.shipping_address_snapshot || "",
    districtId: deliveryResult.error ? "" : deliveryResult.data?.district_id || "",
    districtName: "",
    shippingMethodId: data.shipping_method_id || "",
    deliveryDate: data.delivery_at ? String(data.delivery_at).slice(0, 10) : "",
    deliveryTime: data.delivery_time || "",
    shipOutTime: data.ship_out_time || "",
    customerNote: data.customer_note_snapshot || "",
    packingNote: data.factory_packing_note || "",
    salesPartnerId: data.sales_partner_id || "",
    internalNote: data.remarks || "",
    tagIds: tagsResult.error
      ? []
      : (tagsResult.data ?? []).map((item) => item.order_tag_id),
  };
  return {
    id: data.id,
    orderNumber: data.order_number || "",
    channelId: data.channel_id || "",
    draft,
    financials: {
      shippingFee: toNumber(data.shipping_fee),
      discount: toNumber(data.discount_amount),
      cashdollarRedeemed: toNumber(data.cashdollar_redeemed),
      cashdollarPurchased: toNumber(data.cashdollar_purchased),
    },
    payments: paymentsResult.error
      ? []
      : (paymentsResult.data ?? []).map((payment) => ({
          id: payment.id,
          paymentAt: payment.payment_at ? String(payment.payment_at).slice(0, 10) : "",
          paymentMethodId: payment.payment_method_id || "",
          amount: toNumber(payment.amount),
          reference: payment.receipt_reference || payment.paypal_reference || "",
        })),
  };
}

export async function saveQuotePayments(
  orderId: string,
  orderNumber: string,
  channelId: string,
  payments: QuotePayment[],
) {
  const { data: current, error: currentError } = await supabase
    .from("payments")
    .select("id")
    .eq("order_id", orderId)
    .is("voided_at", null);
  if (currentError) throw currentError;

  const activeIds = new Set(payments.map((payment) => payment.id));
  const removedIds = (current ?? []).map((payment) => payment.id).filter((paymentId) => !activeIds.has(paymentId));
  if (removedIds.length) {
    const { error } = await supabase
      .from("payments")
      .update({ voided_at: new Date().toISOString() })
      .in("id", removedIds);
    if (error) throw error;
  }

  if (!payments.length) return;
  const { error } = await supabase.from("payments").upsert(
    payments.map((payment) => ({
      id: payment.id,
      legacy_id: `web-quote-payment-${payment.id}`,
      order_id: orderId,
      channel_id: channelId || null,
      payment_method_id: payment.paymentMethodId || null,
      order_number_snapshot: orderNumber || null,
      currency: "HKD",
      amount: payment.amount,
      payment_at: payment.paymentAt ? `${payment.paymentAt}T00:00:00+08:00` : null,
      receipt_reference: optional(payment.reference),
      voided_at: null,
    })),
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function sendQuoteConfirmation(orderId: string) {
  const { data, error } = await supabase.functions.invoke("send-quote-confirmation", {
    body: { orderId },
  });
  if (error) throw error;
  if (!data?.watiSent || !data?.emailSent) {
    throw new Error(data?.error || "quote_confirmation_failed");
  }
}

export async function updateQuote(orderId: string, input: QuoteDraft) {
  let districtId = input.districtId || null;
  if (!districtId && input.districtName.trim()) {
    const { data: district, error: districtError } = await supabase
      .from("delivery_districts")
      .select("id")
      .ilike("name", input.districtName.trim())
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (districtError) throw districtError;
    districtId = district?.id || null;
  }
  const deliveryAt = input.deliveryDate
    ? `${input.deliveryDate}T00:00:00+08:00`
    : null;
  const { error: orderError } = await supabase
    .from("orders")
    .update({
      ...quoteWorkflowValues(input),
      channel_id: input.channelId || null,
      customer_name_snapshot: optional(input.customerName),
      company_name_snapshot: optional(input.companyName),
      contact_number_a_snapshot: optional(input.contactA),
      contact_number_b_snapshot: optional(input.contactB),
      email_snapshot: optional(input.email),
      shipping_address_snapshot: optional(input.address),
      customer_note_snapshot: optional(input.customerNote),
      shipping_method_id: input.shippingMethodId || null,
      delivery_at: deliveryAt,
      delivery_time: optional(input.deliveryTime),
      ship_out_time: optional(input.shipOutTime),
      factory_packing_note: optional(input.packingNote),
      sales_partner_id: input.salesPartnerId || null,
      remarks: optional(input.internalNote),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .in("document_type", ["quote", "unconfirmed"]);
  if (orderError) throw orderError;

  const { data: delivery, error: deliveryLookupError } = await supabase
    .from("deliveries")
    .select("id")
    .eq("order_id", orderId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (deliveryLookupError) throw deliveryLookupError;
  const deliveryValues = {
    district_id: districtId,
    shipping_method_id: input.shippingMethodId || null,
    delivery_at: deliveryAt,
    delivery_time: optional(input.deliveryTime),
    ship_out_time: optional(input.shipOutTime),
  };
  const deliveryResult = delivery
    ? await supabase.from("deliveries").update(deliveryValues).eq("id", delivery.id)
    : await supabase.from("deliveries").insert({
        id: crypto.randomUUID(),
        legacy_id: `web-delivery-${crypto.randomUUID()}`,
        order_id: orderId,
        delivery_status: "Pending",
        ...deliveryValues,
      });
  if (deliveryResult.error) throw deliveryResult.error;

  const { error: clearTagsError } = await supabase
    .from("order_tag_assignments")
    .delete()
    .eq("order_id", orderId);
  if (clearTagsError) throw clearTagsError;
  if (input.tagIds.length) {
    const { error: tagError } = await supabase
      .from("order_tag_assignments")
      .insert(input.tagIds.map((orderTagId) => ({ order_id: orderId, order_tag_id: orderTagId })));
    if (tagError) throw tagError;
  }
}

function quoteWorkflowValues(input: QuoteDraft) {
  return {
    quote_status: optional(input.quoteStatus),
    quote_sales_source_id: input.quoteSalesSourceId || null,
    quote_communication_channel_id: input.quoteCommunicationChannelId || null,
    asana_link: optional(input.asanaLink),
  };
}

function safeCatalogTerm(value: string) {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchQuoteCatalog(
  search: string,
  channelId?: string,
): Promise<QuoteCatalogItem[]> {
  const term = safeCatalogTerm(search);
  if (!term) return [];
  const filter = `name.ilike.%${term}%,chinese_name.ilike.%${term}%,sku.ilike.%${term}%`;
  let products = supabase
    .from("products")
    .select("id,sku,name,chinese_name,price")
    .eq("is_active", true)
    .is("archived_at", null)
    .or(filter)
    .limit(12);
  let packages = supabase
    .from("packages")
    .select("id,sku,name,chinese_name,price")
    .eq("is_active", true)
    .is("archived_at", null)
    .or(filter)
    .limit(8);
  if (channelId) {
    products = products.eq("channel_id", channelId);
    packages = packages.eq("channel_id", channelId);
  }
  const [productResult, packageResult] = await Promise.all([products, packages]);
  if (productResult.error) throw productResult.error;
  if (packageResult.error) throw packageResult.error;

  const mapRow = (
    row: { id: string; sku: string | null; name: string; chinese_name: string | null; price: number | string | null },
    kind: QuoteCatalogItem["kind"],
  ): QuoteCatalogItem => ({
    id: row.id,
    kind,
    sku: row.sku,
    name: row.chinese_name || row.name,
    price: row.price === null ? null : toNumber(row.price),
  });
  return [
    ...((productResult.data ?? []) as Parameters<typeof mapRow>[0][]).map((row) => mapRow(row, "product")),
    ...((packageResult.data ?? []) as Parameters<typeof mapRow>[0][]).map((row) => mapRow(row, "package")),
  ];
}

export async function fetchQuoteLines(orderId: string): Promise<QuoteLine[]> {
  const { data, error } = await supabase
    .from("order_lines")
    .select("id,product_id,package_id,sku_snapshot,product_name_snapshot,content_snapshot,quantity,unit_price,total_price,remarks_1")
    .eq("order_id", orderId)
    .eq("is_void", false)
    .order("item_order", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    packageId: row.package_id,
    sku: row.sku_snapshot,
    name: row.product_name_snapshot || row.content_snapshot,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unit_price),
    totalPrice: toNumber(row.total_price),
    remarks: row.remarks_1,
  }));
}

export async function addQuoteLine(input: {
  orderId: string;
  item: QuoteCatalogItem;
  quantity: number;
  unitPrice: number;
  remarks: string;
}) {
  const { error } = await supabase.rpc("add_quote_line", {
    p_order_id: input.orderId,
    p_item_kind: input.item.kind,
    p_item_id: input.item.id,
    p_quantity: input.quantity,
    p_unit_price: input.unitPrice,
    p_remarks: optional(input.remarks),
  });
  if (error) throw error;
}

export async function removeQuoteLine(lineId: string) {
  const { error } = await supabase.rpc("remove_quote_line", { p_line_id: lineId });
  if (error) throw error;
}

export async function updateQuoteLine(line: QuoteLine) {
  const { data, error } = await supabase
    .from("order_lines")
    .update({
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total_price: Math.round(line.quantity * line.unitPrice * 100) / 100,
      remarks_1: optional(line.remarks || ""),
    })
    .eq("id", line.id)
    .select("order_id")
    .single();
  if (error) throw error;
  const { data: currentLines, error: linesError } = await supabase
    .from("order_lines")
    .select("total_price")
    .eq("order_id", data.order_id)
    .eq("is_void", false);
  if (linesError) throw linesError;
  const total = (currentLines ?? []).reduce(
    (sum, item) => sum + toNumber(item.total_price),
    0,
  );
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("shipping_fee,discount_amount,cashdollar_redeemed")
    .eq("id", data.order_id)
    .single();
  if (orderError) throw orderError;
  const adjustedTotal = Math.max(
    0,
    total
      + toNumber(order.shipping_fee)
      - toNumber(order.discount_amount)
      - toNumber(order.cashdollar_redeemed),
  );
  const { error: totalError } = await supabase
    .from("orders")
    .update({ grand_total: adjustedTotal, outstanding: adjustedTotal, updated_at: new Date().toISOString() })
    .eq("id", data.order_id);
  if (totalError) throw totalError;
}

export async function updateQuoteLineOrder(lineIds: string[]) {
  const results = await Promise.all(
    lineIds.map((lineId, index) =>
      supabase
        .from("order_lines")
        .update({ item_order: index + 1 })
        .eq("id", lineId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function updateQuoteFinancials(orderId: string, financials: QuoteFinancials) {
  const { error } = await supabase.rpc("update_quote_financials", {
    p_order_id: orderId,
    p_shipping_fee: financials.shippingFee,
    p_discount_amount: financials.discount,
    p_cashdollar_redeemed: financials.cashdollarRedeemed,
    p_cashdollar_purchased: financials.cashdollarPurchased,
  });
  if (error) throw error;
}

export async function addQuoteUtensilLine(orderId: string) {
  const { error } = await supabase.rpc("add_quote_utensil_line", {
    p_order_id: orderId,
  });
  if (error) throw error;
}
