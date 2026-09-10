import { supabase } from "@/lib/supabase";
import { hongKongDateKey } from "@/lib/date-time";
import { createDeliveryDistrictOption } from "@/lib/delivery-districts";
import { productListDisplayName } from "@/lib/products";
import type { OrderFactorySettings } from "@/lib/order-factory-settings";
import type { QuotePdfSupplementDraft } from "@/lib/quote-pdf-draft";
import { fetchCustomerTags, type CustomerTag } from "@/lib/customer-tags";

export type QuoteEditorOption = {
  id: string;
  name: string;
};

export type QuoteEditorCustomerTagOption = Pick<CustomerTag, "id" | "name" | "typeName">;

export type QuoteEditorOptions = {
  channels: QuoteEditorOption[];
  quoteSalesSources: QuoteEditorOption[];
  quoteCommunicationChannels: QuoteEditorOption[];
  districts: QuoteEditorOption[];
  shippingMethods: QuoteEditorOption[];
  salesPartners: QuoteEditorOption[];
  orderTags: QuoteEditorOption[];
  paymentMethods: QuoteEditorOption[];
  customerTags?: QuoteEditorCustomerTagOption[];
};

export type QuotePayment = {
  id: string;
  paymentAt: string;
  paymentMethodId: string;
  amount: number;
  reference: string;
};

export type QuoteDraft = {
  /** Only used when a quote is copied; regular new quotes may be auto-numbered. */
  orderNumber?: string;
  channelId: string;
  quoteStatus: string;
  quoteAutoClosedAt?: string | null;
  quoteReopenReason?: string;
  quoteSalesSourceId: string;
  quoteCommunicationChannelId: string;
  followUpDate: string;
  customerName: string;
  companyName: string;
  /** Customer-tag selections used by the famous-brand customer field. */
  famousBrandTagIds?: string[];
  /** @deprecated Kept only to read legacy boolean data during migration. */
  isHongKongFamousBrand?: boolean;
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
  shopifyOrderId?: number | null;
  shopifyStoreDomain?: string | null;
  addonShopifyPending?: boolean;
};

export type QuoteEditorSummary = CreatedQuote & {
  documentType: "quote" | "order";
  channelId: string;
  enquirySubmissionId?: string | null;
  grandTotal?: number | null;
  supplements?: QuotePdfSupplementDraft;
  draft: QuoteDraft;
  financials: QuoteFinancials;
  payments: QuotePayment[];
  isSentToFactory?: boolean | null;
  doNotSendToFactory?: boolean | null;
  factoryPrintDate?: string | null;
  factoryReprintRequired?: boolean;
};

export type QuoteEditorDocumentType = "quote" | "order";

export type QuoteFinancials = {
  shippingFee: number;
  discount: number;
  cashdollarRedeemed: number;
  cashdollarPurchased: number;
};

export type QuoteCatalogItem = {
  id: string;
  kind: "product" | "package" | "custom";
  sku: string | null;
  name: string;
  price: number | null;
  labelId?: string | null;
  labelDisplayA?: string | null;
  labelDisplayB?: string | null;
  labels?: QuoteLineLabel[];
};

export function normalizeQuoteProductName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, " ")
    .trim()
    .toLocaleLowerCase("zh-HK");
}

export type QuoteLineLabel = {
  id: string | null;
  displayA: string | null;
  displayB: string | null;
};

export type QuotePackageChoiceSelection = {
  choiceSetId: string;
  packageProductIds: string[];
};

export type QuotePackageChoiceGroup = {
  choiceSetId: string;
  choiceSetName: string | null;
  products: Array<{
    packageProductId: string;
    name: string;
  }>;
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
  /** One editable remark per linked product label; remarks is the first one for legacy callers. */
  labelRemarks?: string[];
  isAddon?: boolean;
  isVoid?: boolean;
  labelId?: string | null;
  labelDisplayA?: string | null;
  labelDisplayB?: string | null;
  labels?: QuoteLineLabel[];
  labelEdited?: boolean;
  packageChoiceGroups?: QuotePackageChoiceGroup[];
  isPending?: boolean;
  pendingItem?: QuoteCatalogItem;
  pendingPackageChoices?: QuotePackageChoiceSelection[];
};

export type QuoteLineLabelRemarkRow = {
  label: QuoteLineLabel | null;
  remark: string;
};

export function quoteLinePrintLabelName(label: QuoteLineLabel): string {
  return [label.displayA, label.displayB]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join("");
}

export function quoteLineLabelRemarkRows(line: QuoteLine): QuoteLineLabelRemarkRow[] {
  const labels = line.labels ?? [];
  const remarks = line.labelRemarks ?? [];
  if (labels.length > 0) {
    return labels.map((label, index) => ({
      label,
      remark: remarks[index] ?? (index === 0 ? line.remarks ?? "" : ""),
    }));
  }
  return [{
    label: null,
    remark: remarks[0] ?? line.remarks ?? "",
  }];
}

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

export function dedupeQuoteOptions(
  items: QuoteEditorOption[],
  preferredId = "",
) {
  const preferred = items.find((item) => item.id === preferredId);
  const preferredKey = preferred?.name.trim().toLocaleLowerCase("zh-HK") ?? "";
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLocaleLowerCase("zh-HK");
    if (preferredKey && key === preferredKey && item.id !== preferredId) return false;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchQuoteEditorOptions(): Promise<QuoteEditorOptions> {
  const [channels, quoteSalesSources, quoteCommunicationChannels, districts, shippingMethods, salesPartners, orderTags, paymentMethods, customerTags] =
    await Promise.all([
      supabase.from("channels").select("id,name").eq("is_active", true).is("archived_at", null).order("sort_order", { nullsFirst: false }).order("name"),
      supabase.from("quote_sales_sources").select("id,name").eq("is_active", true).order("name"),
      supabase.from("quote_communication_channels").select("id,name").eq("is_active", true).order("name"),
      supabase.from("delivery_districts").select("id,name").is("archived_at", null).is("driver_team_id", null).order("name"),
      supabase.from("shipping_methods").select("id,name,display_name").eq("is_active", true).is("archived_at", null).order("display_order", { nullsFirst: false }).order("name"),
      supabase.from("sales_partners").select("id,name").eq("is_active", true).order("name"),
      supabase.from("order_tags").select("id,name").eq("is_active", true).is("archived_at", null).order("name"),
      supabase.from("payment_methods").select("id,name").eq("is_active", true).order("name"),
      fetchCustomerTags(),
    ]);

  const error = [channels, quoteSalesSources, quoteCommunicationChannels, districts, shippingMethods, salesPartners, orderTags, paymentMethods]
    .map((result) => result.error)
    .find(Boolean);
  if (error) throw error;

  return {
    channels: (channels.data ?? []) as NamedRow[],
    quoteSalesSources: (quoteSalesSources.data ?? []) as NamedRow[],
    quoteCommunicationChannels: (quoteCommunicationChannels.data ?? []) as NamedRow[],
    districts: (districts.data ?? []) as NamedRow[],
    shippingMethods: ((shippingMethods.data ?? []) as ShippingRow[]).map((row) => ({
      id: row.id,
      name: row.display_name || row.name,
    })),
    salesPartners: (salesPartners.data ?? []) as NamedRow[],
    orderTags: (orderTags.data ?? []) as NamedRow[],
    paymentMethods: (paymentMethods.data ?? []) as NamedRow[],
    customerTags: customerTags.filter((tag) => tag.isActive).map((tag) => ({
      id: tag.id,
      name: tag.name,
      typeName: tag.typeName,
    })),
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
    p_order_number: optional(input.orderNumber ?? ""),
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

async function resolveDeliveryDistrictId(input: QuoteDraft) {
  let districtId = input.districtId || null;
  if (!districtId && input.districtName.trim()) {
    // Quote managers may lack settings.districts.edit, so create through the
    // security-definer helper instead of a direct table insert.
    const district = await createDeliveryDistrictOption(input.districtName);
    districtId = district.id;
  }
  return districtId;
}

export async function createOrder(input: QuoteDraft): Promise<CreatedQuote> {
  const orderId = crypto.randomUUID();
  const districtId = await resolveDeliveryDistrictId(input);
  const deliveryAt = input.deliveryDate
    ? `${input.deliveryDate}T00:00:00+08:00`
    : null;
  const { data, error } = await supabase
    .from("orders")
    .insert({
      id: orderId,
      legacy_id: `web-order-${orderId}`,
      order_number: optional(input.orderNumber ?? ""),
      document_type: "order",
      channel_id: input.channelId || null,
      customer_name_snapshot: optional(input.customerName),
      company_name_snapshot: optional(input.companyName),
      contact_number_a_snapshot: optional(input.contactA),
      contact_number_b_snapshot: optional(input.contactB),
      email_snapshot: optional(input.email),
      shipping_address_snapshot: optional(input.address),
      customer_note_snapshot: optional(input.customerNote),
      shipping_method_id: input.shippingMethodId || null,
      delivery_district_id: districtId,
      delivery_at: deliveryAt,
      delivery_time: optional(input.deliveryTime),
      ship_out_time: optional(input.shipOutTime),
      factory_packing_note: optional(input.packingNote),
      sales_partner_id: input.salesPartnerId || null,
      remarks: optional(input.internalNote),
      grand_total: 0,
      outstanding: 0,
      is_quote_original: false,
      is_sent_to_factory: false,
      do_not_send_to_factory: false,
      ...quoteWorkflowValues(input),
    })
    .select("id,order_number")
    .single();
  if (error) throw error;
  if (!data?.id || !data.order_number) throw new Error("order_create_failed");

  if (districtId || input.shippingMethodId || input.deliveryDate) {
    const deliveryId = crypto.randomUUID();
    const { error: deliveryError } = await supabase.from("deliveries").insert({
      id: deliveryId,
      legacy_id: `web-delivery-${deliveryId}`,
      order_id: data.id,
      district_id: districtId,
      shipping_method_id: input.shippingMethodId || null,
      delivery_at: deliveryAt,
      delivery_time: optional(input.deliveryTime),
      ship_out_time: optional(input.shipOutTime),
      delivery_status: "Pending",
    });
    if (deliveryError) throw deliveryError;
  }

  if (input.tagIds.length) {
    const { error: tagError } = await supabase
      .from("order_tag_assignments")
      .insert(input.tagIds.map((orderTagId) => ({ order_id: data.id, order_tag_id: orderTagId })));
    if (tagError) throw tagError;
  }

  return { id: data.id as string, orderNumber: data.order_number as string };
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
    p_order_number: optional(input.orderNumber ?? ""),
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

export async function duplicateOrder(
  sourceId: string,
  input: QuoteDraft,
): Promise<CreatedQuote> {
  const [sourceSummary, sourceLines] = await Promise.all([
    fetchQuoteEditorSummary(sourceId, "order"),
    fetchQuoteLines(sourceId),
  ]);
  const created = await createOrder(input);
  if (sourceSummary) {
    await updateQuoteFinancials(created.id, sourceSummary.financials);
  }
  const activeSourceLines = sourceLines.filter(
    (line) => !line.isVoid && line.quantity > 0 && line.unitPrice >= 0,
  );

  for (const line of activeSourceLines) {
    const item: QuoteCatalogItem = line.productId
      ? {
          id: line.productId,
          kind: "product",
          sku: line.sku,
          name: line.name?.trim() || line.sku || "Product",
          price: line.unitPrice,
        }
      : line.packageId
        ? {
            id: line.packageId,
            kind: "package",
            sku: line.sku,
            name: line.name?.trim() || line.sku || "Package",
            price: line.unitPrice,
          }
        : {
            id: crypto.randomUUID(),
            kind: "custom",
            sku: null,
            name: line.name?.trim() || "Custom product",
            price: line.unitPrice,
          };
    const copiedLineId = await addQuoteLine({
      orderId: created.id,
      item,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      remarks: line.remarks || "",
      packageChoices: line.packageChoiceGroups?.map((group) => ({
        choiceSetId: group.choiceSetId,
        packageProductIds: group.products.map((product) => product.packageProductId),
      })),
    });
    if (line.labelRemarks?.length) {
      const { error: remarksError } = await supabase
        .from("order_lines")
        .update({
          label_remarks: line.labelRemarks,
          remarks_1: optional(line.labelRemarks[0] ?? ""),
          remarks_2: optional(line.labelRemarks[1] ?? ""),
        })
        .eq("id", copiedLineId);
      if (remarksError) throw remarksError;
    }
    if (line.isAddon) {
      const { error } = await supabase
        .from("order_lines")
        .update({ is_addon: true })
        .eq("id", copiedLineId);
      if (error) throw error;
    }
  }

  return created;
}

async function resolveCanonicalOrderId(orderId: string): Promise<string> {
  const { data, error } = await supabase
    .from("orders")
    .select("id,merged_into_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data?.merged_into_order_id || data?.id || orderId;
}

export async function fetchQuoteEditorSummary(
  orderId: string,
  documentType: QuoteEditorDocumentType = "quote",
): Promise<QuoteEditorSummary | null> {
  const resolvedOrderId = await resolveCanonicalOrderId(orderId);
  const [
    orderResult,
    deliveryResult,
    tagsResult,
    asanaResult,
    paymentsResult,
    additionalInfoResult,
    activitiesResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id,document_type,order_number,channel_id,enquiry_submission_id,quote_status,quote_auto_closed_at,quote_reopen_reason,quote_sales_source_id,quote_communication_channel_id,quote_follow_up_date,customer_name_snapshot,company_name_snapshot,is_hong_kong_famous_brand,famous_brand_tag_ids,contact_number_a_snapshot,contact_number_b_snapshot,email_snapshot,shipping_address_snapshot,customer_note_snapshot,shipping_method_id,delivery_district_id,delivery_at,delivery_time,ship_out_time,factory_packing_note,sales_partner_id,remarks,shipping_fee,discount_amount,cashdollar_redeemed,cashdollar_purchased,grand_total,is_sent_to_factory,do_not_send_to_factory,factory_print_date,factory_reprint_required,shopify_order_id,addon_shopify_pending,shopify_stores(shop_domain)")
      .eq("id", resolvedOrderId)
       .eq("document_type", documentType)
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("deliveries")
      .select("id,district_id")
      .eq("order_id", resolvedOrderId)
      .order("created_at"),
    supabase
      .from("order_tag_assignments")
      .select("order_tag_id")
      .eq("order_id", resolvedOrderId),
    supabase
      .from("orders")
      .select("asana_link")
      .eq("id", resolvedOrderId)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("id,payment_at,payment_method_id,amount,receipt_reference,paypal_reference")
      .eq("order_id", resolvedOrderId)
      .is("voided_at", null)
      .order("payment_at"),
    documentType === "quote"
      ? supabase
          .from("order_bento_additional_items")
          .select("description_snapshot,sort_order,created_at")
          .eq("order_id", resolvedOrderId)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    documentType === "quote"
      ? supabase
          .from("order_bento_event_parts")
          .select("id,description_snapshot,price_snapshot,sort_order,created_at")
          .eq("order_id", resolvedOrderId)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orderResult.error) throw orderResult.error;
  const data = orderResult.data;
  if (!data) return null;
  const primaryDelivery = (deliveryResult.data ?? []).find((delivery) => delivery.district_id)
    ?? deliveryResult.data?.[0];
  const draft: QuoteDraft = {
    channelId: data.channel_id || "",
    quoteStatus: data.quote_status || "",
    quoteAutoClosedAt: data.quote_auto_closed_at || null,
    quoteReopenReason: data.quote_reopen_reason || "",
    quoteSalesSourceId: data.quote_sales_source_id || "",
    quoteCommunicationChannelId: data.quote_communication_channel_id || "",
    followUpDate: data.quote_follow_up_date || "",
    customerName: data.customer_name_snapshot || "",
    companyName: data.company_name_snapshot || "",
    famousBrandTagIds: Array.isArray(data.famous_brand_tag_ids)
      ? data.famous_brand_tag_ids.filter((id): id is string => typeof id === "string")
      : [],
    isHongKongFamousBrand: data.is_hong_kong_famous_brand === true,
    contactA: data.contact_number_a_snapshot || "",
    contactB: data.contact_number_b_snapshot || "",
    email: data.email_snapshot || "",
    asanaLink: asanaResult.error ? "" : asanaResult.data?.asana_link || "",
    address: data.shipping_address_snapshot || "",
    districtId: deliveryResult.error
      ? data.delivery_district_id || ""
      : primaryDelivery?.district_id || data.delivery_district_id || "",
    districtName: "",
    shippingMethodId: data.shipping_method_id || "",
    deliveryDate: hongKongDateKey(data.delivery_at),
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
  const shopifyStore = data.shopify_stores as unknown as
    | { shop_domain: string | null }
    | Array<{ shop_domain: string | null }>
    | null;
  return {
    id: data.id,
    documentType: data.document_type as QuoteEditorSummary["documentType"],
    orderNumber: data.order_number || "",
    grandTotal: data.grand_total === null ? null : toNumber(data.grand_total),
    supplements: {
      additionalInfo: additionalInfoResult.error
        ? []
        : (additionalInfoResult.data ?? []).flatMap((item) =>
            item.description_snapshot?.trim()
              ? [item.description_snapshot.trim()]
              : [],
          ),
      activities: activitiesResult.error
        ? []
        : (activitiesResult.data ?? []).flatMap((item) =>
            item.description_snapshot?.trim()
              ? [{
                  id: item.id,
                  description: item.description_snapshot.trim(),
                  amount: String(toNumber(item.price_snapshot)),
                }]
              : [],
          ),
      utensilPackQuantity: "0",
      discountLabel: "折扣 (-)",
    },
    shopifyOrderId: data.shopify_order_id,
    shopifyStoreDomain: Array.isArray(shopifyStore)
      ? shopifyStore[0]?.shop_domain ?? null
      : shopifyStore?.shop_domain ?? null,
    addonShopifyPending: data.addon_shopify_pending === true,
    channelId: data.channel_id || "",
    enquirySubmissionId: data.enquiry_submission_id || null,
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
          paymentAt: hongKongDateKey(payment.payment_at),
          paymentMethodId: payment.payment_method_id || "",
          amount: toNumber(payment.amount),
          reference: payment.receipt_reference || payment.paypal_reference || "",
        })),
    isSentToFactory: data.is_sent_to_factory,
    doNotSendToFactory: data.do_not_send_to_factory,
    factoryPrintDate: data.factory_print_date,
    factoryReprintRequired: Boolean(data.factory_reprint_required),
  };
}

export function quoteLineTotal(
  quantity: number | string | null | undefined,
  unitPrice: number | string | null | undefined,
  storedTotal: number | string | null | undefined,
) {
  const total = toNumber(storedTotal);
  if (total > 0) return total;
  return toNumber(quantity) * toNumber(unitPrice);
}

export async function updateOrderFactoryStatus(orderId: string, sent: boolean) {
  const { error } = await supabase.rpc("set_order_factory_status", {
    p_order_id: orderId,
    p_sent: sent,
  });
  if (error) throw error;
}

export async function saveQuotePayments(
  orderId: string,
  orderNumber: string,
  channelId: string,
  payments: QuotePayment[],
  documentType: QuoteEditorDocumentType = "quote",
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

  if (payments.length) {
    const { error } = await supabase.from("payments").upsert(
      payments.map((payment) => ({
        id: payment.id,
        legacy_id: `web-${documentType}-payment-${payment.id}`,
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

  if (documentType === "order") {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("grand_total")
      .eq("id", orderId)
      .eq("document_type", "order")
      .single();
    if (orderError) throw orderError;
    const paid = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    const { error: outstandingError } = await supabase
      .from("orders")
      .update({ outstanding: toNumber(order.grand_total) - paid, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("document_type", "order");
    if (outstandingError) throw outstandingError;
  }
}

export async function saveSalesDocumentBatch(input: {
  orderId: string;
  documentType: QuoteEditorDocumentType;
  lines: QuoteLine[];
  financials: QuoteFinancials;
  payments: QuotePayment[];
  channelId: string;
  orderNumber: string;
  factorySettings: OrderFactorySettings;
}) {
  const { error } = await supabase.rpc("save_sales_document_batch", {
    p_order_id: input.orderId,
    p_document_type: input.documentType,
    p_lines: input.lines.filter((line) => !line.isVoid).map((line) => ({
      id: line.id,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      remarks: line.labelRemarks?.[0] ?? line.remarks ?? null,
      label_remarks: line.labelRemarks ?? [line.remarks ?? ""],
      remarks_1: line.labelRemarks?.[0] ?? line.remarks ?? null,
      remarks_2: line.labelRemarks?.[1] ?? null,
    })),
    p_shipping_fee: input.financials.shippingFee,
    p_discount_amount: input.financials.discount,
    p_cashdollar_redeemed: input.financials.cashdollarRedeemed,
    p_cashdollar_purchased: input.financials.cashdollarPurchased,
    p_payments: input.documentType === "order"
      ? input.payments.map((payment) => ({
          id: payment.id,
          payment_at: payment.paymentAt ? `${payment.paymentAt}T00:00:00+08:00` : null,
          payment_method_id: payment.paymentMethodId || null,
          amount: payment.amount,
          reference: payment.reference || null,
        }))
      : [],
    p_channel_id: input.channelId || null,
    p_order_number: input.orderNumber || null,
    p_factory_settings: input.documentType === "order" ? input.factorySettings : {},
  });
  if (error) throw error;
  const { error: remarksError } = await supabase.rpc("save_order_line_label_remarks_batch", {
    p_order_id: input.orderId,
    p_lines: input.lines.filter((line) => !line.isVoid).map((line) => ({
      id: line.id,
      label_remarks: line.labelRemarks ?? [line.remarks ?? ""],
    })),
  });
  if (remarksError) throw remarksError;
}

export async function sendQuoteConfirmation(orderId: string) {
  const { data, error } = await supabase.functions.invoke("send-quote-confirmation", {
    body: { orderId },
  });
  if (error) throw error;
  if ((!data?.watiSent && !data?.watiSkipped) || (!data?.emailSent && !data?.emailSkipped)) {
    throw new Error(data?.error || "quote_confirmation_failed");
  }
}

export async function updateQuote(
  orderId: string,
  input: QuoteDraft,
  documentType: QuoteEditorDocumentType = "quote",
) {
  let districtId = input.districtId || null;
  if (!districtId && input.districtName.trim()) {
    const district = await createDeliveryDistrictOption(input.districtName);
    districtId = district.id;
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
      delivery_district_id: districtId,
      delivery_at: deliveryAt,
      delivery_time: optional(input.deliveryTime),
      ship_out_time: optional(input.shipOutTime),
      factory_packing_note: optional(input.packingNote),
      sales_partner_id: input.salesPartnerId || null,
      remarks: optional(input.internalNote),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("document_type", documentType);
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
  if (delivery) {
    const deliveryResult = await supabase
      .from("deliveries")
      .update(deliveryValues)
      .eq("id", delivery.id);
    if (deliveryResult.error) throw deliveryResult.error;
  } else if (documentType !== "order") {
    const deliveryResult = await supabase.from("deliveries").insert({
      id: crypto.randomUUID(),
      legacy_id: `web-delivery-${crypto.randomUUID()}`,
      order_id: orderId,
      delivery_status: "Pending",
      ...deliveryValues,
    });
    if (deliveryResult.error) throw deliveryResult.error;
  }

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

export function quoteWorkflowValues(input: QuoteDraft) {
  const reopeningAutoClosedQuote = Boolean(input.quoteAutoClosedAt) && input.quoteStatus !== "Case Closed";
  const famousBrandTagIds = input.famousBrandTagIds ?? [];
  return {
    quote_status: optional(input.quoteStatus),
    quote_auto_closed_at: reopeningAutoClosedQuote ? null : input.quoteAutoClosedAt ?? null,
    quote_close_reason: reopeningAutoClosedQuote ? null : undefined,
    quote_reopen_reason: reopeningAutoClosedQuote ? optional(input.quoteReopenReason ?? "") : undefined,
    quote_sales_source_id: input.quoteSalesSourceId || null,
    quote_communication_channel_id: input.quoteCommunicationChannelId || null,
    quote_follow_up_date: input.followUpDate || null,
    // Customer tags are authoritative. Keep the old flag only when an older
    // caller explicitly supplies it; new saves must not infer fame from any
    // arbitrary customer tag.
    is_hong_kong_famous_brand: Boolean(input.isHongKongFamousBrand),
    famous_brand_tag_ids: famousBrandTagIds,
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
    .select("id,sku,name,chinese_name,price,product_labels(id,display_name,quantity_label,created_at)")
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
    row: { id: string; sku: string | null; name: string; chinese_name: string | null; price: number | string | null; product_labels?: Array<{ id: string; display_name: string | null; quantity_label: string | null; created_at: string }> },
    kind: QuoteCatalogItem["kind"],
  ): QuoteCatalogItem => {
    const sortedLabels = kind === "product"
      ? [...(row.product_labels ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
      : [];
    const label = sortedLabels.find((item) => item.display_name?.trim() || item.quantity_label?.trim())
      ?? sortedLabels[0];
    const labels = sortedLabels
      .filter((item) => item.display_name?.trim() || item.quantity_label?.trim())
      .map((item) => ({ id: item.id, displayA: item.display_name, displayB: item.quantity_label }));
    return {
      id: row.id,
      kind,
      sku: row.sku,
      name: productListDisplayName(row.name, row.chinese_name, row.sku ?? "-"),
      price: row.price === null ? null : toNumber(row.price),
      labelId: label?.id ?? null,
      labelDisplayA: label?.display_name ?? null,
      labelDisplayB: label?.quantity_label ?? null,
      labels,
    };
  };
  return [
    ...((productResult.data ?? []) as Parameters<typeof mapRow>[0][]).map((row) => mapRow(row, "product")),
    ...((packageResult.data ?? []) as Parameters<typeof mapRow>[0][]).map((row) => mapRow(row, "package")),
  ];
}

export async function findQuoteProductsByName(
  name: string,
  channelId?: string,
): Promise<QuoteCatalogItem[]> {
  const normalizedName = normalizeQuoteProductName(name);
  if (!normalizedName) return [];

  const searchTerm = name.normalize("NFKC").replace(/[\s\u3000]+/g, " ").trim();
  let query = supabase
    .from("products")
    .select("id,sku,name,chinese_name,price")
    .eq("is_active", true)
    .is("archived_at", null)
    .ilike("name", searchTerm)
    .limit(20);
  if (channelId) query = query.eq("channel_id", channelId);
  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    sku: string | null;
    name: string;
    chinese_name: string | null;
    price: number | string | null;
  }>)
    .filter((row) => normalizeQuoteProductName(row.name) === normalizedName)
    .map((row) => ({
      id: row.id,
      kind: "product" as const,
      sku: row.sku,
      name: row.name.trim(),
      price: row.price === null ? null : toNumber(row.price),
    }));
}

export async function fetchQuoteLines(orderId: string): Promise<QuoteLine[]> {
  const resolvedOrderId = await resolveCanonicalOrderId(orderId);
  const [orderResult, lineResult, choiceResult] = await Promise.all([
    supabase
      .from("orders")
      .select("document_type")
      .eq("id", resolvedOrderId)
      .single(),
    supabase
      .from("order_lines")
      .select("id,product_id,package_id,sku_snapshot,product_name_snapshot,content_snapshot,quantity,unit_price,total_price,remarks_1,remarks_2,label_remarks,is_addon,is_void,temporary_label_display_name,temporary_label_quantity_label,products(name,product_labels(id,display_name,quantity_label,created_at)),packages(name)")
      .eq("order_id", resolvedOrderId)
      .order("item_order", { ascending: true, nullsFirst: false })
      .order("created_at"),
    supabase
      .from("order_package_choice_snapshots")
      .select("order_line_id,package_choice_set_id,package_product_id,package_choice_sets(choice_type),package_products(products(name,chinese_name))")
      .eq("order_id", resolvedOrderId)
      .eq("is_selected", true)
      .not("order_line_id", "is", null)
      .order("created_at"),
  ]);
  if (orderResult.error) throw orderResult.error;
  if (lineResult.error) throw lineResult.error;
  if (choiceResult.error) throw choiceResult.error;

  type ChoiceSnapshotRow = {
    order_line_id: string;
    package_choice_set_id: string;
    package_product_id: string;
    package_choice_sets: { choice_type: string | null } | Array<{ choice_type: string | null }> | null;
    package_products: {
      products: { name: string; chinese_name: string | null } | Array<{ name: string; chinese_name: string | null }> | null;
    } | Array<{
      products: { name: string; chinese_name: string | null } | Array<{ name: string; chinese_name: string | null }> | null;
    }> | null;
  };
  const relatedOne = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? value[0] ?? null : value;
  const choiceGroupsByLine = new Map<string, QuotePackageChoiceGroup[]>();
  for (const snapshot of (choiceResult.data ?? []) as unknown as ChoiceSnapshotRow[]) {
    const choiceSet = relatedOne(snapshot.package_choice_sets);
    const packageProduct = relatedOne(snapshot.package_products);
    const product = relatedOne(packageProduct?.products ?? null);
    const groups = choiceGroupsByLine.get(snapshot.order_line_id) ?? [];
    let group = groups.find((item) => item.choiceSetId === snapshot.package_choice_set_id);
    if (!group) {
      group = {
        choiceSetId: snapshot.package_choice_set_id,
        choiceSetName: choiceSet?.choice_type ?? null,
        products: [],
      };
      groups.push(group);
    }
    group.products.push({
      packageProductId: snapshot.package_product_id,
      name: product?.name || product?.chinese_name || "-",
    });
    choiceGroupsByLine.set(snapshot.order_line_id, groups);
  }

  const rows = orderResult.data.document_type === "order"
    ? [
        ...(lineResult.data ?? []).filter((row) => !row.is_void),
        ...(lineResult.data ?? []).filter((row) => row.is_void),
      ]
    : (lineResult.data ?? []).filter((row) => !row.is_void);

  return rows.map((row) => {
    type LabelRow = { id: string; display_name: string | null; quantity_label: string | null; created_at: string };
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const pkg = Array.isArray(row.packages) ? row.packages[0] : row.packages;
    const labels = ((product as { product_labels?: LabelRow[] } | null)?.product_labels ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const label = labels.find((item) => item.display_name?.trim() || item.quantity_label?.trim())
      ?? labels[0];
    const lineLabels: QuoteLineLabel[] = labels
      .filter((item) => item.display_name?.trim() || item.quantity_label?.trim())
      .map((item) => ({ id: item.id, displayA: item.display_name, displayB: item.quantity_label }));
    if (!lineLabels.length && (row.temporary_label_display_name?.trim() || row.temporary_label_quantity_label?.trim())) {
      lineLabels.push({
        id: null,
        displayA: row.temporary_label_display_name ?? null,
        displayB: row.temporary_label_quantity_label ?? null,
      });
    }
    const storedLabelRemarks = Array.isArray(row.label_remarks)
      ? row.label_remarks.map((remark) => String(remark ?? ""))
      : [];
    const legacyLabelRemarks = [
      row.remarks_1 ?? "",
      ...(lineLabels.length > 1 || row.remarks_2?.trim() ? [row.remarks_2 ?? ""] : []),
    ];
    const labelRemarks = Array.from(
      { length: Math.max(lineLabels.length, storedLabelRemarks.length, legacyLabelRemarks.length) },
      (_, index) => storedLabelRemarks[index] ?? legacyLabelRemarks[index] ?? "",
    );
    return {
      id: row.id,
      productId: row.product_id,
      packageId: row.package_id,
      sku: row.sku_snapshot,
      name: productListDisplayName(
        (product as { name?: string | null } | null)?.name ?? (pkg as { name?: string | null } | null)?.name,
        null,
        row.product_name_snapshot || row.content_snapshot || "",
      ),
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unit_price),
      totalPrice: quoteLineTotal(row.quantity, row.unit_price, row.total_price),
      remarks: row.remarks_1,
      labelRemarks,
      isAddon: row.is_addon === true,
      isVoid: row.is_void === true,
      labelId: label?.id ?? null,
      labelDisplayA: label?.display_name ?? row.temporary_label_display_name ?? null,
      labelDisplayB: label?.quantity_label ?? row.temporary_label_quantity_label ?? null,
      labels: lineLabels,
      packageChoiceGroups: choiceGroupsByLine.get(row.id) ?? [],
    };
  });
}

export async function addQuoteLine(input: {
  orderId: string;
  item: QuoteCatalogItem;
  quantity: number;
  unitPrice: number;
  remarks: string;
  packageChoices?: QuotePackageChoiceSelection[];
}): Promise<string> {
  if (input.item.kind === "custom") {
    const { data, error } = await supabase.rpc("add_custom_quote_line", {
      p_order_id: input.orderId,
      p_name: input.item.name,
      p_quantity: input.quantity,
      p_unit_price: input.unitPrice,
      p_remarks: optional(input.remarks),
    });
    if (error) throw error;
    return data as string;
  }
  const { data, error } = await supabase.rpc("add_quote_line", {
    p_order_id: input.orderId,
    p_item_kind: input.item.kind,
    p_item_id: input.item.id,
    p_quantity: input.quantity,
    p_unit_price: input.unitPrice,
    p_remarks: optional(input.remarks),
    p_package_choices: input.packageChoices ?? [],
  });
  if (error) throw error;
  return data as string;
}

export async function updateQuoteLineLabel(line: QuoteLine): Promise<void> {
  const displayA = optional(line.labelDisplayA || "");
  const displayB = optional(line.labelDisplayB || "");
  let labelId = line.labelId ?? null;

  // Resolve the link again at save time. This also covers products inserted by
  // pickers whose compact catalog payload did not include label metadata.
  if (!labelId && line.productId) {
    const { data, error } = await supabase
      .from("product_labels")
      .select("id,display_name,quantity_label")
      .eq("product_id", line.productId)
      .order("created_at")
      .limit(20);
    if (error) throw error;
    const labels = (data ?? []) as Array<{ id: string; display_name: string | null; quantity_label: string | null }>;
    labelId = (labels.find((item) => item.display_name?.trim() || item.quantity_label?.trim()) ?? labels[0])?.id ?? null;
  }

  if (labelId) {
    const { error } = await supabase
      .from("product_labels")
      .update({ display_name: displayA, quantity_label: displayB })
      .eq("id", labelId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("order_lines")
    .update({
      temporary_label_display_name: displayA,
      temporary_label_quantity_label: displayB,
    })
    .eq("id", line.id);
  if (error) throw error;
}

export async function removeQuoteLine(lineId: string) {
  const { error } = await supabase.rpc("remove_quote_line", { p_line_id: lineId });
  if (error) throw error;
}

export async function setOrderLineVoided(lineId: string, isVoid: boolean) {
  const { error } = await supabase.rpc("set_order_line_void", {
    p_line_id: lineId,
    p_is_void: isVoid,
  });
  if (error) throw error;
}

export async function updateQuoteLine(
  line: QuoteLine,
  _documentType: QuoteEditorDocumentType = "quote",
) {
  const { data, error } = await supabase
    .from("order_lines")
    .update({
      product_id: line.productId,
      package_id: line.packageId,
      sku_snapshot: optional(line.sku || ""),
      product_name_snapshot: optional(line.name || ""),
      content_snapshot: optional(line.name || ""),
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total_price: Math.round(line.quantity * line.unitPrice * 100) / 100,
      label_remarks: line.labelRemarks ?? [line.remarks ?? ""],
      remarks_1: optional(line.labelRemarks?.[0] ?? line.remarks ?? ""),
      remarks_2: optional(line.labelRemarks?.[1] ?? ""),
    })
    .eq("id", line.id)
    .select("order_id")
    .single();
  if (error) throw error;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("shipping_fee,discount_amount,cashdollar_redeemed,cashdollar_purchased")
    .eq("id", data.order_id)
    .single();
  if (orderError) throw orderError;
  const { error: totalError } = await supabase.rpc("update_quote_financials", {
    p_order_id: data.order_id,
    p_shipping_fee: toNumber(order.shipping_fee),
    p_discount_amount: toNumber(order.discount_amount),
    p_cashdollar_redeemed: toNumber(order.cashdollar_redeemed),
    p_cashdollar_purchased: toNumber(order.cashdollar_purchased),
  });
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

export type QuoteSaveErrorKey =
  | "create"
  | "permission"
  | "channelRequired"
  | "customerRequired"
  | "districtPermission"
  | "invalidLine"
  | "paymentInvalid";

function errorText(cause: unknown) {
  if (!cause || typeof cause !== "object") {
    return typeof cause === "string" ? cause : "";
  }
  const record = cause as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  return [record.message, record.code, record.details, record.hint]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
}

const QUOTE_SAVE_ERROR_KEYS = new Set<QuoteSaveErrorKey>([
  "create",
  "permission",
  "channelRequired",
  "customerRequired",
  "districtPermission",
  "invalidLine",
  "paymentInvalid",
]);

export function isQuoteSaveErrorKey(value: string | null | undefined): value is QuoteSaveErrorKey {
  return Boolean(value && QUOTE_SAVE_ERROR_KEYS.has(value as QuoteSaveErrorKey));
}

/** Ensure auto-filled shipping districts are present on the draft before save/create. */
export function quoteDraftForSave(
  draft: QuoteDraft,
  automaticDistrictName?: string | null,
): QuoteDraft {
  if (draft.districtId || draft.districtName.trim()) return draft;
  const autoName = automaticDistrictName?.trim() ?? "";
  if (!autoName) return draft;
  return { ...draft, districtName: autoName };
}

/**
 * Payments worth sending to the order save path. Incomplete "add payment"
 * stubs (date / outstanding amount filled, method still blank) must not be
 * sent — the batch RPC rejects a null method. Refunds are negative amounts
 * and must still persist.
 */
export function isPersistableOrderPayment(payment: QuotePayment): boolean {
  return Boolean(
    payment.paymentAt
    && payment.paymentMethodId
    && Number.isFinite(payment.amount)
    && payment.amount !== 0,
  );
}

/** Map raw create/save failures to UI copy. Avoid blaming permissions by default. */
export function classifyQuoteSaveError(cause: unknown): QuoteSaveErrorKey {
  const text = errorText(cause);
  if (!text) return "create";
  // Client-side checks run before any network call; keep their messages specific.
  if (text.includes("quote_line_invalid")) return "invalidLine";
  if (
    text.includes("quote_payment_invalid")
    || text.includes("invalid_order_payment")
  ) {
    return "paymentInvalid";
  }
  if (text.includes("channel_required")) return "channelRequired";
  if (text.includes("customer_required")) return "customerRequired";
  if (
    text.includes("district_create_not_allowed") ||
    text.includes("district_create_failed")
  ) {
    return "districtPermission";
  }
  if (
    text.includes("42501") ||
    text.includes("permission denied") ||
    text.includes("row-level security") ||
    text.includes("violates row-level security") ||
    text.includes("forbidden") ||
    text.includes("not authorized")
  ) {
    return "permission";
  }
  return "create";
}
