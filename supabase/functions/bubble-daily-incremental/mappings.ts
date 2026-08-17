import type { BubbleRecord } from "./helpers.ts";
import { requireLegacyId } from "./helpers.ts";

export type Phase = "a" | "b" | "c" | "d1" | "d2" | "e" | "remaining";

export type Relation = {
  legacyField: string;
  idField: string;
  table: string;
  required?: boolean;
};

export type ChildRows = {
  table: string;
  onConflict: string;
  rows: Array<Record<string, unknown>>;
  relations?: Relation[];
};

export type SourceMapping = {
  phase: Phase;
  sourceType: string;
  table: string;
  map: (record: BubbleRecord) => Record<string, unknown>;
  relations?: Relation[];
  children?: (
    records: BubbleRecord[],
    parentIds: ReadonlyMap<string, string>,
  ) => ChildRows[];
};

const text = (value: unknown) =>
  typeof value === "string" && value ? value : null;
export const phoneText = (value: unknown) => {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};
const windowText = phoneText;
const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const booleanValue = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;
const list = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string =>
      typeof item === "string" && item.length > 0
    )
    : [];
const dateValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const metadata = (record: BubbleRecord) => ({
  bubble_created_at: dateValue(record["Created Date"]),
  bubble_modified_at: dateValue(record["Modified Date"]),
});
const base = (record: BubbleRecord) => ({
  legacy_id: requireLegacyId(record),
  ...metadata(record),
});
const relation = (
  legacyField: string,
  idField: string,
  table: string,
  required = true,
): Relation => ({ legacyField, idField, table, required });

const simple = (
  phase: Phase,
  sourceType: string,
  table: string,
  sourceName: string,
  targetName = "name",
): SourceMapping => ({
  phase,
  sourceType,
  table,
  map: (row) => ({
    ...base(row),
    [targetName]: text(row[sourceName]) || requireLegacyId(row),
  }),
});

const phaseA: SourceMapping[] = [
  {
    phase: "a",
    sourceType: "ds_channel",
    table: "channels",
    map: (r) => ({
      ...base(r),
      name: text(r["Display Name"]) || text(r["Brand Name"]) ||
        requireLegacyId(r),
      short_name: text(r.Shortform),
      website: text(r.Website),
      email: text(r.Email),
      sort_order: numberValue(r.sort),
      is_active: true,
    }),
  },
  {
    phase: "a",
    sourceType: "ds_paymentmethod",
    table: "payment_methods",
    map: (r) => ({
      ...base(r),
      name: text(r["Method Name"]) || requireLegacyId(r),
      paypal_reference: r["Paypal ID"] == null ? null : String(r["Paypal ID"]),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "a",
    sourceType: "ds_super_motorcade",
    table: "delivery_teams",
    map: (r) => ({
      ...base(r),
      name: text(r["Full Name"]) || text(r["Contact person"]) ||
        requireLegacyId(r),
      short_name: text(r["One Word"]),
      contact_person: text(r["Contact person"]),
      contact_number: r["contact no."] == null
        ? null
        : String(r["contact no."]),
      status: r.Status == null ? null : String(r.Status),
      login_code: r.Login_code == null || r.Login_code === ""
        ? null
        : String(r.Login_code),
      is_active: true,
    }),
  },
  {
    phase: "a",
    sourceType: "ds_deliverydistrict",
    table: "delivery_districts",
    map: (r) => ({
      ...base(r),
      name: text(r.District) || requireLegacyId(r),
      default_fee: numberValue(r.DeliveryFee),
      driver_team_legacy_id: text(r["Driver team"]),
      driver_team_id: null,
    }),
    relations: [
      relation("driver_team_legacy_id", "driver_team_id", "delivery_teams"),
    ],
  },
  {
    phase: "a",
    sourceType: "ds_shippingmethod",
    table: "shipping_methods",
    map: (r) => ({
      ...base(r),
      name: text(r.Real_Name) || text(r["Display Name"]) ||
        requireLegacyId(r),
      display_name: text(r["Display Name"]),
      display_order: numberValue(r["Display Order"]),
      requires_address_check: booleanValue(r["Address check"]),
      is_editable: booleanValue(r.editable),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "a",
    sourceType: "ds_status",
    table: "order_statuses",
    map: (r) => ({
      ...base(r),
      name: text(r["Display Name"]) || requireLegacyId(r),
      color: text(r.color),
      sort_order: numberValue(r.order),
      is_follow_up: booleanValue(r["follow up"]),
      is_editable: booleanValue(r.editable),
    }),
  },
  {
    phase: "a",
    sourceType: "nos_ordertag",
    table: "order_tags",
    map: (r) => ({
      ...base(r),
      name: text(r.Display) || requireLegacyId(r),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "a",
    sourceType: "ds__ingredient_supplier",
    table: "suppliers",
    map: (r) => ({
      ...base(r),
      company_name: text(r["Company name"]) || requireLegacyId(r),
      contact_person: text(r["Contact person"]),
      phone_number: text(r["Phone no."]),
      delivery_schedule: text(r.deliver_schedule),
      payment_schedule: text(r.payment_schedule),
      comment: text(r.comment),
      is_active: booleanValue(r.Active, true),
    }),
  },
  {
    phase: "a",
    sourceType: "shopdsrestro",
    table: "restaurants",
    map: (r) => ({
      ...base(r),
      name: text(r.Name) || requireLegacyId(r),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "a",
    sourceType: "shop_ds_restro_depart",
    table: "restaurant_departments",
    map: (r) => ({
      ...base(r),
      name: text(r.depart_name) || requireLegacyId(r),
      sort_order: numberValue(r.sort),
      is_active: booleanValue(r.active, true),
    }),
  },
];

const phaseB: SourceMapping[] = [
  {
    phase: "b",
    sourceType: "a_products",
    table: "products",
    map: (r) => ({
      ...base(r),
      channel_id: null,
      channel_legacy_id: text(r.R_Channel),
      sku: text(r.SKU)?.trim() || null,
      name: text(r["Product Name"]) || requireLegacyId(r),
      chinese_name: text(r["Chinese Name"]),
      description: text(r.Description),
      image_url: text(r.Image),
      price: numberValue(r.Price),
      price_min: numberValue(r.PriceRange_Min),
      price_max: numberValue(r.PriceRange_Max),
      status: r.Status == null ? null : String(r.Status),
      is_active: booleanValue(r.Active, true),
      bento_main_type_id: null,
      bento_main_type_legacy_id: text(r["bento_main dish"]),
    }),
    relations: [
      relation("channel_legacy_id", "channel_id", "channels"),
      relation(
        "bento_main_type_legacy_id",
        "bento_main_type_id",
        "bento_main_types",
      ),
    ],
  },
  {
    phase: "b",
    sourceType: "a_packages",
    table: "packages",
    map: (r) => ({
      ...base(r),
      channel_id: null,
      channel_legacy_id: text(r.Channel),
      sku: text(r.SKU),
      name: text(r["Package Name"]) || requireLegacyId(r),
      chinese_name: text(r["Chinese Name"]),
      description: text(r.Description),
      price: numberValue(r.Price),
      status: r.Status == null ? null : String(r.Status),
      is_active: true,
    }),
    relations: [relation("channel_legacy_id", "channel_id", "channels")],
  },
  {
    phase: "b",
    sourceType: "s_packages_product",
    table: "package_products",
    map: (r) => ({
      ...base(r),
      package_id: null,
      package_legacy_id: text(r.Package),
      product_id: null,
      product_legacy_id: text(r.Product),
      package_choice_set_legacy_id: text(r.Package_ChoiceSet),
      quantity: numberValue(r.Quantity),
      addon_price: numberValue(r["Add-on Price"]),
      is_selected: booleanValue(r.Selected),
    }),
    relations: [
      relation("package_legacy_id", "package_id", "packages"),
      relation("product_legacy_id", "product_id", "products"),
    ],
  },
];

const phaseC: SourceMapping[] = [
  {
    phase: "c",
    sourceType: "a_order",
    table: "orders",
    map: (r) => ({
      ...base(r),
      customer_id: null,
      customer_legacy_id: text(r.A_customer),
      channel_id: null,
      channel_legacy_id: text(r.ORDER_Channel),
      order_number: text(r["ORDER_Order Number"]),
      document_type: r["(Quote)chg to order"] === true ||
          r.AddOrder_DONE === true || r.Shopify_NewOrder === true
        ? "order"
        : r["(Quote) Status"] || r["(Quote)_description"]
        ? "quote"
        : "unconfirmed",
      quote_status: r["(Quote) Status"] == null
        ? null
        : String(r["(Quote) Status"]),
      delivery_status: r.Delivery_Status == null
        ? null
        : String(r.Delivery_Status),
      order_status_legacy_ids: list(r.ORDER_Status),
      customer_name_snapshot: text(r["ORDER_Customer Name"]),
      company_name_snapshot: text(r["ORDER_Company Name"]),
      email_snapshot: text(r["ORDER_Email Address"]),
      contact_number_a_snapshot: phoneText(r["ORDER_Contact Number A"]),
      contact_number_b_snapshot: phoneText(r["ORDER_Contact Number B"]),
      shipping_address_snapshot: text(r["Shipping Address"]),
      customer_note_snapshot: text(r["ORDER_Customer Note"]),
      quote_description_snapshot: text(r["(Quote)_description"]),
      delivery_terms_snapshot: text(r["(Quote) delivery text"]),
      discount_amount: numberValue(r["ORDER_折扣(-)"]) ?? 0,
      shipping_fee: numberValue(r["ORDER_運費(+)"]) ?? 0,
      cashdollar_purchased: numberValue(r.ORDER_購買Cashdollar) ?? 0,
      cashdollar_redeemed: numberValue(r.ORDER_扣除Cashdollar) ?? 0,
      grand_total: numberValue(r["ORDER_Grand total"]),
      outstanding: numberValue(r.ORDER_oustanding),
      delivery_at: dateValue(r.Delivery_Date),
      factory_date: dateValue(r.Factory_date1_sd),
      factory_print_date: dateValue(r.Factory_date2_Print),
      delivery_time: windowText(r.Delivery_Time),
      ship_out_time: windowText(r["Delivery_Ship Out Time"]),
      remarks: text(r.ORDER_Remarks),
      factory_packing_note: text(r["Factory_Packing Note"]),
      is_shopify_order: booleanValue(r.Shopify_NewOrder),
      is_quote_original: booleanValue(r["(Quote)Original"]),
      is_sent_to_factory: booleanValue(r["Factory_send/not"]),
      bubble_created_by_legacy_id: text(r["Created By"]),
      shipping_method_id: null,
      shipping_method_legacy_id: text(r["Delivery_DS_Shipping Method"]),
    }),
    relations: [
      relation("customer_legacy_id", "customer_id", "customers"),
      relation("channel_legacy_id", "channel_id", "channels"),
      relation(
        "shipping_method_legacy_id",
        "shipping_method_id",
        "shipping_methods",
        false,
      ),
    ],
  },
  {
    phase: "c",
    sourceType: "s_order",
    table: "order_lines",
    map: (r) => ({
      ...base(r),
      order_id: null,
      order_legacy_id: text(r.Order),
      product_id: null,
      product_legacy_id: text(r.Product),
      package_id: null,
      package_legacy_id: text(r.Package),
      sku_snapshot: text(r.SKU),
      product_name_snapshot: text(r.newproductname),
      content_snapshot: text(r.real_content_info),
      quantity: numberValue(r.Quantity),
      new_quantity_text: text(r.newquantity),
      unit_price: numberValue(r["Unit Price"]),
      total_price: numberValue(r["Total Price"]),
      item_order: numberValue(r["Item order"]),
      type_sort: numberValue(r.TypeSort),
      remarks_1: text(r.remarks1),
      remarks_2: text(r.remarks2),
      delivery_at: dateValue(r.DeliDate),
      is_addon: booleanValue(r["Add-on"]),
      is_void: booleanValue(r.Void),
      is_printed: booleanValue(r.Printed),
      is_sent_to_factory: booleanValue(r["Send to Factory"]),
    }),
    relations: [
      relation("order_legacy_id", "order_id", "orders"),
      relation("product_legacy_id", "product_id", "products"),
      relation("package_legacy_id", "package_id", "packages"),
    ],
  },
  {
    phase: "c",
    sourceType: "s_payment",
    table: "payments",
    map: (r) => ({
      ...base(r),
      order_id: null,
      order_legacy_id: text(r.Order),
      channel_id: null,
      channel_legacy_id: text(r.Channels),
      payment_method_id: null,
      payment_method_legacy_id: text(r["Payment Method"]),
      order_number_snapshot: text(r["OrderNo."]),
      amount: numberValue(r.Amount) ?? 0,
      payment_at: dateValue(r["Payment Date"]),
      payout_at: dateValue(r["Payout date"]),
      paypal_reference: text(r["Paypal ID"]),
      receipt_reference: text(r.Rec),
    }),
    relations: [
      relation("order_legacy_id", "order_id", "orders"),
      relation("channel_legacy_id", "channel_id", "channels"),
      relation(
        "payment_method_legacy_id",
        "payment_method_id",
        "payment_methods",
      ),
    ],
  },
  {
    phase: "c",
    sourceType: "b_deliveryschedule",
    table: "deliveries",
    map: (r) => ({
      ...base(r),
      order_id: null,
      order_legacy_id: text(r.A_order),
      district_id: null,
      district_legacy_id: text(r["DS_delivery district"]),
      motorcade_legacy_id: text(r.DS_motorcade),
      subdriver_legacy_id: text(r.DS_Super_Motorcade_supDriver),
      delivery_at: dateValue(r["Delivery Date_A_order"]),
      delivery_time: windowText(r["Delivery Time_A_order"]),
      fulfilled_at: dateValue(r["fulfill_date&time(trigger A_order)"]),
      taken_at: dateValue(r["take_date&time"]),
      ship_out_time: windowText(r["Ship-out Time_A_order"]),
      driver_confirmation_status: r["OS driver conformation"] == null
        ? null
        : String(r["OS driver conformation"]),
      delivery_status: r["OS driver delivery status"] == null
        ? null
        : String(r["OS driver delivery status"]),
      basic_fee: numberValue(r["Basic_district deli fee"]),
      total_fee: numberValue(r["Basic+surcharge total"]),
      image_references: list(r.image),
    }),
    relations: [
      relation("order_legacy_id", "order_id", "orders"),
      relation("district_legacy_id", "district_id", "delivery_districts"),
      relation("motorcade_legacy_id", "motorcade_id", "delivery_teams"),
    ],
  },
];

const phaseD1: SourceMapping[] = [
  {
    phase: "d1",
    sourceType: "ds_ingredients",
    table: "ingredients",
    map: (r) => ({
      ...base(r),
      supplier_id: null,
      supplier_legacy_id: text(r.Supplier),
      sku: text(r.SKU),
      name: text(r["Display Name"]) || requireLegacyId(r),
      description: text(r.Description),
      ingredient_type: text(r.Type),
      product_unit: text(r.ProductUnit),
      stocktake_unit: text(r.StockTakeUnit),
      product_quantity: numberValue(r.productQ),
      cost_per_product_unit: numberValue(r["cost/ProductUnit"]),
      cost_per_stocktake_unit: numberValue(r["cost/stockTakeUnit"]),
      is_ingredient_stocktake: booleanValue(r["食材盤點"]),
      is_packing_stocktake: booleanValue(r["包裝盤點"]),
      is_active: booleanValue(r.Active, true),
    }),
    relations: [relation("supplier_legacy_id", "supplier_id", "suppliers")],
  },
  {
    phase: "d1",
    sourceType: "s_ingredients_product",
    table: "product_ingredients",
    map: (r) => ({
      ...base(r),
      ingredient_id: null,
      ingredient_legacy_id: text(r.Ingredients),
      product_id: null,
      product_legacy_id: text(r.Product),
      package_id: null,
      package_legacy_id: text(r.Package),
      quantity: numberValue(r.Quantity),
      test_quantity: numberValue(r.test),
    }),
    relations: [
      relation("ingredient_legacy_id", "ingredient_id", "ingredients"),
      relation("product_legacy_id", "product_id", "products"),
      relation("package_legacy_id", "package_id", "packages"),
    ],
  },
  {
    phase: "d1",
    sourceType: "b_product_ingredients",
    table: "order_bom_requirements",
    map: (r) => ({
      ...base(r),
      order_id: null,
      order_legacy_id: text(r.A_order),
      order_line_id: null,
      order_line_legacy_id: text(r.S_order),
      product_id: null,
      product_legacy_id: text(r.Order_product),
      ingredient_id: null,
      ingredient_legacy_id: text(r.Ingredient),
      delivery_at: dateValue(r["Deli_date(trigger)"]),
      ingredient_quantity: numberValue(r.ing_Q),
      product_quantity: numberValue(r["productQ(trigger)"]),
      calculated_quantity: numberValue(r["ingQ*productQ(trigger)"]),
    }),
    relations: [
      relation("order_legacy_id", "order_id", "orders"),
      relation(
        "order_line_legacy_id",
        "order_line_id",
        "order_lines",
        false,
      ),
      relation("product_legacy_id", "product_id", "products"),
      relation("ingredient_legacy_id", "ingredient_id", "ingredients"),
    ],
  },
];

const phaseD2: SourceMapping[] = [
  {
    phase: "d2",
    sourceType: "m_cal_to_kg",
    table: "meat_unit_conversions",
    map: (r) => ({
      ...base(r),
      unit: text(r.unit) || requireLegacyId(r),
      multiplier: numberValue(r.multiplier),
    }),
  },
  {
    phase: "d2",
    sourceType: "m_calculation%",
    table: "meat_calculation_settings",
    map: (r) => ({
      ...base(r),
      is_applied: booleanValue(r.applied),
      markup_rate: numberValue(r["Mark-up"]),
      variation_rate: numberValue(r.Variation),
    }),
  },
  {
    phase: "d2",
    sourceType: "m_customer",
    table: "meat_customers",
    map: (r) => ({
      ...base(r),
      customer_code: text(r.cust_code),
      name: text(r.Name) || requireLegacyId(r),
      address: text(r.address),
      phone: text(r.fone),
      contact_person: text(r["contact person"]),
      delivery_note_required: booleanValue(r.DN_needed),
    }),
  },
  {
    phase: "d2",
    sourceType: "m_rawmeat",
    table: "raw_meat_items",
    map: (r) => ({
      ...base(r),
      sku: text(r.SKU),
      name: text(r.name) || requireLegacyId(r),
      english_name: text(r.name_Eng),
      unit: text(r.Unit),
      current_seasoning_cost: numberValue(r.current_seasoning_cost),
      current_seasoning_code: numberValue(r.curr_seasoning_code),
      current_markup_rate: numberValue(r.Curr_Markup),
      current_variation_rate: numberValue(r.curr_variation),
      sort_order: numberValue(r.sort_order),
      can_ship_directly: booleanValue(r.CanOut_directly),
      is_active: booleanValue(r.Active, true),
    }),
    children: (records, parentIds) => [{
      table: "raw_meat_item_suppliers",
      onConflict: "raw_meat_item_id,supplier_id",
      relations: [
        relation("supplier_legacy_id", "supplier_id", "suppliers"),
      ],
      rows: records.flatMap((r) =>
        list(r.Supplier).map((supplierLegacyId) => ({
          raw_meat_item_id: parentIds.get(requireLegacyId(r)),
          raw_meat_item_legacy_id: requireLegacyId(r),
          supplier_id: null,
          supplier_legacy_id: supplierLegacyId,
        }))
      ),
    }],
  },
  {
    phase: "d2",
    sourceType: "m_donemeat",
    table: "prepared_meat_items",
    map: (r) => ({
      ...base(r),
      raw_meat_item_id: null,
      raw_meat_item_legacy_id: text(r.raw_meat),
      sku: text(r.SKU),
      name: text(r.Name) || requireLegacyId(r),
      english_name: text(r.Name_Eng),
      unit: text(r.Unit),
      kg_per_package: numberValue(r["kg/包"]),
      sort_order: numberValue(r.sort_order),
      is_active: booleanValue(r.active, true),
    }),
    relations: [
      relation(
        "raw_meat_item_legacy_id",
        "raw_meat_item_id",
        "raw_meat_items",
      ),
    ],
  },
  {
    phase: "d2",
    sourceType: "m_seasoning",
    table: "seasonings",
    map: (r) => ({
      ...base(r),
      name: text(r.name) || requireLegacyId(r),
      description: text(r.description),
      calculation_expression: text(r.calculate_expression),
      cost_per_gram: numberValue(r["cost/g"]),
      last_updated_at: dateValue(r.LastUpdate),
      sort_order: numberValue(r.sort),
    }),
  },
  simple("d2", "m_shippingmethod", "meat_shipping_methods", "Method"),
  {
    phase: "d2",
    sourceType: "m_outdone_order",
    table: "meat_orders",
    map: (r) => ({
      ...base(r),
      meat_customer_id: null,
      meat_customer_legacy_id: text(r.M_cust),
      shipping_method_id: null,
      shipping_method_legacy_id: text(r.shippingMethod),
      order_number: text(r.orderNumber),
      order_at: dateValue(r.orderDate),
      shipping_at: dateValue(r.shippingDate),
      print_at: dateValue(r.printdate),
      sent_at: dateValue(r.senddate),
      send_to_factory: booleanValue(r["send to factory"]),
      remarks: text(r.remarks),
    }),
    relations: [
      relation(
        "meat_customer_legacy_id",
        "meat_customer_id",
        "meat_customers",
      ),
      relation(
        "shipping_method_legacy_id",
        "shipping_method_id",
        "meat_shipping_methods",
      ),
    ],
  },
  {
    phase: "d2",
    sourceType: "m_outdone_donemeat",
    table: "meat_order_lines",
    map: (r) => ({
      ...base(r),
      meat_order_id: null,
      meat_order_legacy_id: text(r.M_outDone_order),
      prepared_meat_item_id: null,
      prepared_meat_item_legacy_id: text(r.M_doneMeat),
      raw_meat_item_id: null,
      raw_meat_item_legacy_id: text(r.M_rawMeat),
      quantity: numberValue(r.quantity),
      sort_order: numberValue(r.sortNo),
      remarks: text(r.remarks),
    }),
    relations: [
      relation("meat_order_legacy_id", "meat_order_id", "meat_orders"),
      relation(
        "prepared_meat_item_legacy_id",
        "prepared_meat_item_id",
        "prepared_meat_items",
      ),
      relation(
        "raw_meat_item_legacy_id",
        "raw_meat_item_id",
        "raw_meat_items",
      ),
    ],
  },
  {
    phase: "d2",
    sourceType: "m_raw_stock",
    table: "raw_meat_stock_movements",
    map: (r) => ({
      ...base(r),
      raw_meat_item_id: null,
      raw_meat_item_legacy_id: text(r.Raw_meat),
      supplier_id: null,
      supplier_legacy_id: text(r.in_supplier),
      meat_order_line_id: null,
      meat_order_line_legacy_id: text(r.M_outDone_doneMeat),
      movement_at: dateValue(r.date),
      inbound_quantity_kg: numberValue(r["in_quantity(kg)"]),
      outbound_quantity_kg: numberValue(r["out_quantity(kg)"]),
      allocated_inbound_quantity_kg: numberValue(r.out_from_in),
      inbound_unit_price: numberValue(r["in_price(HKD/kg)"]),
      inbound_total_amount: numberValue(r["in_totalAmount(HKD)"]),
      applied_seasoning_cost: numberValue(r.applied_seasoning_cost),
      applied_seasoning_code: numberValue(r.applied_seasoning_code),
      applied_markup_rate: numberValue(r.applied_mark_up),
      applied_variation_rate: numberValue(r.applied_variation),
      applied_seasoning_per_kg: numberValue(r["applied_seasoning/kg"]),
      raw_meat_order: text(r.RawMeat_Order),
      remarks: text(r.Remarks),
    }),
    relations: [
      relation(
        "raw_meat_item_legacy_id",
        "raw_meat_item_id",
        "raw_meat_items",
      ),
      relation("supplier_legacy_id", "supplier_id", "suppliers"),
      relation(
        "meat_order_line_legacy_id",
        "meat_order_line_id",
        "meat_order_lines",
      ),
    ],
    children: (records, parentIds) => [{
      table: "raw_meat_stock_relations",
      onConflict: "movement_id,inbound_movement_id",
      relations: [
        relation(
          "inbound_movement_legacy_id",
          "inbound_movement_id",
          "raw_meat_stock_movements",
        ),
      ],
      rows: records.flatMap((r) =>
        list(r.rel_in_stock).map((inboundLegacyId) => ({
          movement_id: parentIds.get(requireLegacyId(r)),
          movement_legacy_id: requireLegacyId(r),
          inbound_movement_id: null,
          inbound_movement_legacy_id: inboundLegacyId,
        }))
      ),
    }],
  },
  {
    phase: "d2",
    sourceType: "m_donemeat_stock",
    table: "prepared_meat_stock_movements",
    map: (r) => ({
      ...base(r),
      prepared_meat_item_id: null,
      prepared_meat_item_legacy_id: text(r.DoneMeat),
      meat_customer_id: null,
      meat_customer_legacy_id: text(r.Shop_M_cust),
      meat_order_line_id: null,
      meat_order_line_legacy_id: text(r.M_outDone_doneMeat),
      movement_at: dateValue(r.Date),
      inbound_packages: numberValue(r["in/包"]),
      outbound_packages: numberValue(r["out/包"]),
      prepared_meat_order: numberValue(r.DoneMeat_order),
      remarks: text(r.remark),
    }),
    relations: [
      relation(
        "prepared_meat_item_legacy_id",
        "prepared_meat_item_id",
        "prepared_meat_items",
      ),
      relation(
        "meat_customer_legacy_id",
        "meat_customer_id",
        "meat_customers",
      ),
      relation(
        "meat_order_line_legacy_id",
        "meat_order_line_id",
        "meat_order_lines",
      ),
    ],
    children: (records, parentIds) => [{
      table: "prepared_meat_stock_raw_sources",
      onConflict: "prepared_movement_id,raw_stock_movement_legacy_id",
      relations: [
        relation(
          "raw_stock_movement_legacy_id",
          "raw_stock_movement_id",
          "raw_meat_stock_movements",
          false,
        ),
      ],
      rows: records.flatMap((r) =>
        list(r.from_rawStock_list).map((rawLegacyId) => ({
          prepared_movement_id: parentIds.get(requireLegacyId(r)),
          prepared_movement_legacy_id: requireLegacyId(r),
          raw_stock_movement_id: null,
          raw_stock_movement_legacy_id: rawLegacyId,
        }))
      ),
    }],
  },
  {
    phase: "d2",
    sourceType: "m_meatseasoning_cost",
    table: "meat_seasoning_cost_versions",
    map: (r) => ({
      ...base(r),
      prepared_meat_item_id: null,
      prepared_meat_item_legacy_id: text(r.M_doneMeat),
      raw_meat_item_id: null,
      raw_meat_item_legacy_id: text(r.M_rawMeat),
      seasoning_id: null,
      seasoning_legacy_id: text(r.seasoning),
      production_raw_meat_kg: numberValue(r["製作生肉份量KG"]),
      seasoning_quantity_grams: numberValue(r["quantity(g)"]),
      total_cost: numberValue(r["Total($*q)"]),
      unit_cost: numberValue(r.unit_cost),
      version_code: numberValue(r.code),
      seasoning_sort: numberValue(r.seasoning_sort),
      is_applied: booleanValue(r.apply),
    }),
    relations: [
      relation(
        "prepared_meat_item_legacy_id",
        "prepared_meat_item_id",
        "prepared_meat_items",
      ),
      relation(
        "raw_meat_item_legacy_id",
        "raw_meat_item_id",
        "raw_meat_items",
      ),
      relation("seasoning_legacy_id", "seasoning_id", "seasonings"),
    ],
  },
  {
    phase: "d2",
    sourceType: "m_monthly_meatprice",
    table: "meat_price_versions",
    map: (r) => ({
      ...base(r),
      raw_meat_item_id: null,
      raw_meat_item_legacy_id: text(r.Raw_meat),
      month_at: dateValue(r.Month),
      shop_price: numberValue(r.Price_shop),
      room_price: numberValue(r.Price_roomR),
    }),
    relations: [
      relation(
        "raw_meat_item_legacy_id",
        "raw_meat_item_id",
        "raw_meat_items",
      ),
    ],
  },
  {
    phase: "d2",
    sourceType: "s_ingredient_stocktake",
    table: "ingredient_stocktake_events",
    map: (r) => ({
      ...base(r),
      ingredient_id: null,
      ingredient_legacy_id: text(r["active ingredient"]),
      stocktake_at: dateValue(r["stocktake Date"]),
      quantity: numberValue(r.Quantity),
      sku_snapshot: text(r.SKU),
    }),
    relations: [
      relation("ingredient_legacy_id", "ingredient_id", "ingredients"),
    ],
  },
  {
    phase: "d2",
    sourceType: "s_packing_stocktake",
    table: "packing_stocktake_events",
    map: (r) => ({
      ...base(r),
      ingredient_id: null,
      ingredient_legacy_id: text(r.packing_DS_ing),
      stocktake_at: dateValue(r["Stocktake Date"]),
      quantity: numberValue(r.Quantity),
      sku_snapshot: text(r.SKU),
    }),
    relations: [
      relation("ingredient_legacy_id", "ingredient_id", "ingredients"),
    ],
  },
];

const phaseE: SourceMapping[] = [
  {
    phase: "e",
    sourceType: "shop_dspaymentmethod",
    table: "restaurant_payment_methods",
    map: (r) => ({
      ...base(r),
      name: text(r["Shop_payment method"]) || requireLegacyId(r),
      sort_order: numberValue(r.sort),
      deducts_petty_cash: booleanValue(r["扣零用金"]),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "e",
    sourceType: "shop_dsrestro_period",
    table: "restaurant_service_periods",
    map: (r) => ({
      ...base(r),
      name: text(r["period name"]) || requireLegacyId(r),
      sort_order: numberValue(r.sort),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "e",
    sourceType: "shop_food_deli_platform",
    table: "restaurant_delivery_platforms",
    map: (r) => ({
      ...base(r),
      name: text(r.platform_name) || requireLegacyId(r),
      sort_order: numberValue(r.sort),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "e",
    sourceType: "shop_ds_new_product",
    table: "restaurant_new_products",
    map: (r) => ({
      ...base(r),
      name: text(r.new_product_name) || requireLegacyId(r),
      remarks_enabled: booleanValue(r.remarks),
      remarks_placeholder: text(r.remarks_placeholder),
      is_active: booleanValue(r.active, true),
    }),
  },
  {
    phase: "e",
    sourceType: "shop_dscost_type",
    table: "restaurant_cost_types",
    map: (r) => ({
      ...base(r),
      name: text(r["Cost Type"]) || requireLegacyId(r),
      sort_order: numberValue(r.sort_order),
    }),
  },
  {
    phase: "e",
    sourceType: "shopds_purchasetype",
    table: "restaurant_purchase_types",
    map: (r) => ({
      ...base(r),
      name: text(r["purchase type"]) || requireLegacyId(r),
      sort_order: numberValue(r.Sort),
      is_active: booleanValue(r.Active, true),
    }),
  },
  {
    phase: "e",
    sourceType: "shop_dscost",
    table: "restaurant_costs",
    map: (r) => ({
      ...base(r),
      cost_type_id: null,
      cost_type_legacy_id: text(r["Cost Type"]),
      name: text(r["cost name"]) || requireLegacyId(r),
      sort_order: numberValue(r.sort_order),
      is_active: booleanValue(r.active, true),
    }),
    relations: [
      relation(
        "cost_type_legacy_id",
        "cost_type_id",
        "restaurant_cost_types",
      ),
    ],
  },
  {
    phase: "e",
    sourceType: "shop_ingredients",
    table: "restaurant_ingredients",
    map: (r) => ({
      ...base(r),
      supplier_id: null,
      supplier_legacy_id: text(r.Supplier),
      name: text(r["Display Name"]) || requireLegacyId(r),
      unit: text(r.unit),
      cost_per_unit: numberValue(r["cost/Unit"]),
      is_active: booleanValue(r.active, true),
    }),
    relations: [relation("supplier_legacy_id", "supplier_id", "suppliers")],
    children: (records, parentIds) => [{
      table: "restaurant_ingredient_departments",
      onConflict: "restaurant_ingredient_id,department_name",
      rows: records.flatMap((r) =>
        list(r.shop_depart).map((departmentName) => ({
          restaurant_ingredient_id: parentIds.get(requireLegacyId(r)),
          restaurant_ingredient_legacy_id: requireLegacyId(r),
          department_name: departmentName,
        }))
      ),
    }],
  },
  {
    phase: "e",
    sourceType: "shop_dailysales",
    table: "restaurant_daily_sales",
    map: (r) => ({
      ...base(r),
      restaurant_id: null,
      restaurant_legacy_id: text(r.restro),
      payment_method_id: null,
      payment_method_legacy_id: text(r["SHOP_DS pyament method"]),
      service_period_id: null,
      service_period_legacy_id: text(r.SHOP_DS_time_period),
      restaurant_department_id: null,
      restaurant_department_legacy_id: text(r.SHOP_DS_restro_depart),
      delivery_platform_id: null,
      delivery_platform_legacy_id: text(r.SHOP_food_deli_platform),
      new_product_id: null,
      new_product_legacy_id: text(r.SHOP_DS_new_product),
      sales_at: dateValue(r.date),
      amount: numberValue(r.amount),
      quantity: numberValue(r.quantity),
      sort_order: numberValue(r.sort),
      is_control_total: booleanValue(r.controlTotal),
      is_remark_section: booleanValue(r.RemarkSection),
      has_image: booleanValue(r.image),
      image_url: text(r.image),
      pos_sheet_url: text(r["POS sheet"]),
      petty_cash: booleanValue(r.pettyCash),
      petty_cash_amount: numberValue(r.pettyCash_amount),
      remarks: text(r.Remarks),
      real_cash_count_amount: numberValue(r.Realcash_count_amount),
      real_cash_count: numberValue(r.Realcash_count),
      manager_hours_department: text(r["OS shop man hr depart"]),
      working_hours: numberValue(r["Working Hour"]),
      average_per_working_hour: numberValue(r["avg$/working hour"]),
    }),
    relations: [
      relation("restaurant_legacy_id", "restaurant_id", "restaurants"),
      relation(
        "payment_method_legacy_id",
        "payment_method_id",
        "restaurant_payment_methods",
      ),
      relation(
        "service_period_legacy_id",
        "service_period_id",
        "restaurant_service_periods",
      ),
      relation(
        "restaurant_department_legacy_id",
        "restaurant_department_id",
        "restaurant_departments",
      ),
      relation(
        "delivery_platform_legacy_id",
        "delivery_platform_id",
        "restaurant_delivery_platforms",
      ),
      relation(
        "new_product_legacy_id",
        "new_product_id",
        "restaurant_new_products",
      ),
    ],
  },
  {
    phase: "e",
    sourceType: "shop_monthly_cost",
    table: "restaurant_monthly_costs",
    map: (r) => ({
      ...base(r),
      restaurant_id: null,
      restaurant_legacy_id: text(r.Restro),
      cost_id: null,
      cost_legacy_id: text(r.cost),
      cost_type_id: null,
      cost_type_legacy_id: text(r.Cost_type),
      month_at: dateValue(r.month),
      amount: numberValue(r.amount),
      cost_type_sort: numberValue(r.cost_type_sort),
      can_proceed_pnl: booleanValue(r.Can_proceed_PNL),
      remarks: text(r.Remarks),
    }),
    relations: [
      relation("restaurant_legacy_id", "restaurant_id", "restaurants"),
      relation("cost_legacy_id", "cost_id", "restaurant_costs"),
      relation(
        "cost_type_legacy_id",
        "cost_type_id",
        "restaurant_cost_types",
      ),
    ],
  },
  {
    phase: "e",
    sourceType: "shop_stocktake",
    table: "restaurant_stocktake_events",
    map: (r) => ({
      ...base(r),
      restaurant_id: null,
      restaurant_legacy_id: text(r.Shop_restro),
      restaurant_ingredient_id: null,
      restaurant_ingredient_legacy_id: text(r.shop_ingredients),
      supplier_id: null,
      supplier_legacy_id: text(r.Supplier),
      department_name: text(r["OS depart"]),
      stocktake_at: dateValue(r.stock_date),
      quantity: numberValue(r.quantity),
      unit_cost: numberValue(r["unit cost"]),
      total_cost: numberValue(r.total_cost),
    }),
    relations: [
      relation("restaurant_legacy_id", "restaurant_id", "restaurants"),
      relation(
        "restaurant_ingredient_legacy_id",
        "restaurant_ingredient_id",
        "restaurant_ingredients",
      ),
      relation("supplier_legacy_id", "supplier_id", "suppliers"),
    ],
  },
  {
    phase: "e",
    sourceType: "shop_supplier_purchase",
    table: "restaurant_supplier_purchases",
    map: (r) => ({
      ...base(r),
      restaurant_id: null,
      restaurant_legacy_id: text(r.Restro),
      supplier_id: null,
      supplier_legacy_id: text(r.supplier),
      purchase_type_id: null,
      purchase_type_legacy_id: text(r.type),
      purchased_at: dateValue(r.date),
      amount: numberValue(r.amount),
    }),
    relations: [
      relation("restaurant_legacy_id", "restaurant_id", "restaurants"),
      relation("supplier_legacy_id", "supplier_id", "suppliers"),
      relation(
        "purchase_type_legacy_id",
        "purchase_type_id",
        "restaurant_purchase_types",
      ),
    ],
  },
];

export const unsupportedMappings: Record<Phase, string[]> = {
  a: [],
  b: ["customers (historical Phase B importer explicitly imported zero rows)"],
  c: [],
  d1: [],
  d2: [],
  e: [
    "shop_ds_holiday",
    "shop_ds_staff_list",
    "shop_ds_time_slot",
    "shop_roster",
  ],
  remaining: [
    "quote_file (file/attachment migration explicitly excluded)",
    "a_products_backfill (historical UPDATE intentionally excluded)",
    "a_orders_backfill (historical UPDATE intentionally excluded)",
  ],
};

export const coreMappings: SourceMapping[] = [
  ...phaseA,
  ...phaseB,
  ...phaseC,
  ...phaseD1,
  ...phaseD2,
  ...phaseE,
];

export { base, booleanValue, dateValue, list, numberValue, relation, text };
