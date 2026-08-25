import type { BubbleRecord } from "./helpers.ts";

export const AUGUST_OVERWRITE_SINCE = "2026-07-31T16:00:00.000Z";
export const INVENTORY_OVERWRITE_SINCE = "2026-08-09T16:00:00.000Z";
export const AUGUST_OVERWRITE_CONFIRMATION = "APPLY_AUGUST_2026_OVERWRITE";

export const overwriteFieldSources = {
  a_order: {
    bubble_created_at: ["Created Date"],
    bubble_modified_at: ["Modified Date"],
    customer_id: ["A_customer"],
    customer_legacy_id: ["A_customer"],
    channel_id: ["ORDER_Channel"],
    channel_legacy_id: ["ORDER_Channel"],
    order_number: ["ORDER_Order Number"],
    document_type: [
      "(Quote)chg to order",
      "AddOrder_DONE",
      "Shopify_NewOrder",
      "(Quote) Status",
      "(Quote)_description",
    ],
    quote_status: ["(Quote) Status"],
    order_status_legacy_ids: ["ORDER_Status"],
    customer_name_snapshot: ["ORDER_Customer Name"],
    company_name_snapshot: ["ORDER_Company Name"],
    email_snapshot: ["ORDER_Email Address"],
    contact_number_a_snapshot: ["ORDER_Contact Number A"],
    contact_number_b_snapshot: ["ORDER_Contact Number B"],
    shipping_address_snapshot: ["Shipping Address"],
    customer_note_snapshot: ["ORDER_Customer Note"],
    quote_description_snapshot: ["(Quote)_description"],
    delivery_terms_snapshot: ["(Quote) delivery text"],
    discount_amount: ["ORDER_折扣(-)"],
    shipping_fee: ["ORDER_運費(+)"],
    cashdollar_purchased: ["ORDER_購買Cashdollar"],
    cashdollar_redeemed: ["ORDER_扣除Cashdollar"],
    grand_total: ["ORDER_Grand total"],
    outstanding: ["ORDER_oustanding"],
    delivery_at: ["Delivery_Date"],
    factory_date: ["Factory_date1_sd"],
    factory_print_date: ["Factory_date2_Print"],
    delivery_time: ["Delivery_Time"],
    ship_out_time: ["Delivery_Ship Out Time"],
    remarks: ["ORDER_Remarks"],
    factory_packing_note: ["Factory_Packing Note"],
    is_shopify_order: ["Shopify_NewOrder"],
    is_quote_original: ["(Quote)Original"],
    is_sent_to_factory: ["Factory_send/not"],
    bubble_created_by_legacy_id: ["Created By"],
    shipping_method_id: ["Delivery_DS_Shipping Method"],
    shipping_method_legacy_id: ["Delivery_DS_Shipping Method"],
  },
  s_order: {
    bubble_created_at: ["Created Date"],
    bubble_modified_at: ["Modified Date"],
    order_id: ["Order"],
    order_legacy_id: ["Order"],
    product_id: ["Product"],
    product_legacy_id: ["Product"],
    package_id: ["Package"],
    package_legacy_id: ["Package"],
    sku_snapshot: ["SKU"],
    product_name_snapshot: ["newproductname"],
    content_snapshot: ["real_content_info"],
    quantity: ["Quantity"],
    new_quantity_text: ["newquantity"],
    unit_price: ["Unit Price"],
    total_price: ["Total Price"],
    item_order: ["Item order"],
    type_sort: ["TypeSort"],
    remarks_1: ["remarks1"],
    remarks_2: ["remarks2"],
    delivery_at: ["DeliDate"],
    is_addon: ["Add-on"],
    is_void: ["Void"],
    is_printed: ["Printed"],
    is_sent_to_factory: ["Send to Factory"],
  },
  s_payment: {
    bubble_created_at: ["Created Date"],
    bubble_modified_at: ["Modified Date"],
    order_id: ["Order"],
    order_legacy_id: ["Order"],
    channel_id: ["Channels"],
    channel_legacy_id: ["Channels"],
    payment_method_id: ["Payment Method"],
    payment_method_legacy_id: ["Payment Method"],
    order_number_snapshot: ["OrderNo."],
    amount: ["Amount"],
    payment_at: ["Payment Date"],
    payout_at: ["Payout date"],
    paypal_reference: ["Paypal ID"],
    receipt_reference: ["Rec"],
  },
  b_deliveryschedule: {
    bubble_created_at: ["Created Date"],
    bubble_modified_at: ["Modified Date"],
    order_id: ["A_order"],
    order_legacy_id: ["A_order"],
    district_id: ["DS_delivery district"],
    district_legacy_id: ["DS_delivery district"],
    motorcade_id: ["DS_motorcade"],
    motorcade_legacy_id: ["DS_motorcade"],
    subdriver_legacy_id: ["DS_Super_Motorcade_supDriver"],
    delivery_at: ["Delivery Date_A_order"],
    delivery_time: ["Delivery Time_A_order"],
    fulfilled_at: ["fulfill_date&time(trigger A_order)"],
    taken_at: ["take_date&time"],
    ship_out_time: ["Ship-out Time_A_order"],
    driver_confirmation_status: ["OS driver conformation"],
    basic_fee: ["Basic_district deli fee"],
    total_fee: ["Basic+surcharge total"],
    image_references: ["image"],
  },
  m_raw_stock: {
    bubble_created_at: ["Created Date"],
    bubble_modified_at: ["Modified Date"],
    raw_meat_item_id: ["Raw_meat"],
    raw_meat_item_legacy_id: ["Raw_meat"],
    supplier_id: ["in_supplier"],
    supplier_legacy_id: ["in_supplier"],
    meat_order_line_id: ["M_outDone_doneMeat"],
    meat_order_line_legacy_id: ["M_outDone_doneMeat"],
    movement_at: ["date"],
    inbound_quantity_kg: ["in_quantity(kg)"],
    outbound_quantity_kg: ["out_quantity(kg)"],
    allocated_inbound_quantity_kg: ["out_from_in"],
    inbound_unit_price: ["in_price(HKD/kg)"],
    inbound_total_amount: ["in_totalAmount(HKD)"],
    applied_seasoning_cost: ["applied_seasoning_cost"],
    applied_seasoning_code: ["applied_seasoning_code"],
    applied_markup_rate: ["applied_mark_up"],
    applied_variation_rate: ["applied_variation"],
    applied_seasoning_per_kg: ["applied_seasoning/kg"],
    raw_meat_order: ["RawMeat_Order"],
    remarks: ["Remarks"],
  },
  m_donemeat_stock: {
    bubble_created_at: ["Created Date"],
    bubble_modified_at: ["Modified Date"],
    prepared_meat_item_id: ["DoneMeat"],
    prepared_meat_item_legacy_id: ["DoneMeat"],
    meat_customer_id: ["Shop_M_cust"],
    meat_customer_legacy_id: ["Shop_M_cust"],
    meat_order_line_id: ["M_outDone_doneMeat"],
    meat_order_line_legacy_id: ["M_outDone_doneMeat"],
    movement_at: ["Date"],
    inbound_packages: ["in/包"],
    outbound_packages: ["out/包"],
    prepared_meat_order: ["DoneMeat_order"],
    remarks: ["remark"],
  },
} as const;

const overwriteNumericScales: Partial<Record<string, number>> = {
  inbound_quantity_kg: 3,
  outbound_quantity_kg: 3,
  allocated_inbound_quantity_kg: 3,
  inbound_unit_price: 4,
  inbound_total_amount: 2,
  applied_seasoning_cost: 4,
  applied_seasoning_code: 4,
  applied_markup_rate: 6,
  applied_variation_rate: 6,
  applied_seasoning_per_kg: 4,
  inbound_packages: 3,
  outbound_packages: 3,
  prepared_meat_order: 3,
};

export type OverwriteSourceType = keyof typeof overwriteFieldSources;

export function isOverwriteSourceType(value: unknown): value is OverwriteSourceType {
  return typeof value === "string" && value in overwriteFieldSources;
}

export function overwriteSince(sourceType: OverwriteSourceType): string {
  return sourceType === "m_raw_stock" || sourceType === "m_donemeat_stock"
    ? INVENTORY_OVERWRITE_SINCE
    : AUGUST_OVERWRITE_SINCE;
}

function hasOwn(record: BubbleRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

export function mergeOverwriteRow(
  sourceType: OverwriteSourceType,
  source: BubbleRecord,
  mapped: Record<string, unknown>,
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  const dependencies = overwriteFieldSources[sourceType];
  const merged: Record<string, unknown> = { legacy_id: mapped.legacy_id };
  for (const [targetField, sourceFields] of Object.entries(dependencies)) {
    const supplied = sourceFields.some((sourceField) => hasOwn(source, sourceField));
    if (supplied || !existing) merged[targetField] = mapped[targetField];
    else merged[targetField] = existing[targetField];
  }
  if (
    sourceType === "a_order" && existing && existing.shopify_order_id != null
  ) {
    merged.is_shopify_order = existing.is_shopify_order;
    merged.outstanding = existing.outstanding;
  }
  return merged;
}

export function changedOverwriteFields(
  row: Record<string, unknown>,
  existing: Record<string, unknown>,
): string[] {
  return Object.keys(row).filter((field) =>
    field !== "legacy_id" &&
    !equivalentOverwriteValue(row[field], existing[field], field)
  );
}

function equivalentOverwriteValue(
  left: unknown,
  right: unknown,
  field: string,
): boolean {
  if (left == null && right == null) return true;
  if (
    (typeof left === "number" || typeof left === "string") &&
    (typeof right === "number" || typeof right === "string")
  ) {
    const leftText = String(left);
    const rightText = String(right);
    const isoDate = /^\d{4}-\d{2}-\d{2}T/;
    if (isoDate.test(leftText) && isoDate.test(rightText)) {
      return Date.parse(leftText) === Date.parse(rightText);
    }
    if (leftText.trim() !== "" && rightText.trim() !== "") {
      const leftNumber = Number(leftText);
      const rightNumber = Number(rightText);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        const scale = overwriteNumericScales[field];
        if (scale != null) {
          const halfUnit = 0.5 * 10 ** -scale;
          return Math.abs(leftNumber - rightNumber) < halfUnit + Number.EPSILON;
        }
        return leftNumber === rightNumber;
      }
    }
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function normalizeOrderNumber(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
