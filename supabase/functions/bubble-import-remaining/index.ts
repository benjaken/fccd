import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-migration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BubbleRow = Record<string, unknown>;
type Mapping = {
  table: string;
  map: (row: BubbleRow) => Record<string, unknown>;
};

const text = (row: BubbleRow, key: string) =>
  typeof row[key] === "string" && row[key] !== "" ? row[key] : null;
const number = (row: BubbleRow, key: string) =>
  typeof row[key] === "number" ? row[key] : null;
const bool = (row: BubbleRow, key: string, fallback = false) =>
  typeof row[key] === "boolean" ? row[key] : fallback;
const dates = (row: BubbleRow) => ({
  bubble_created_at: text(row, "Created Date"),
  bubble_modified_at: text(row, "Modified Date"),
});
const base = (row: BubbleRow) => ({
  legacy_id: text(row, "_id"),
  ...dates(row),
});
const range = (row: BubbleRow, key: string, index: number) => {
  const value = row[key];
  return Array.isArray(value) && typeof value[index] === "string"
    ? value[index]
    : null;
};
const simple = (
  table: string,
  sourceName: string,
  targetName = "name",
): Mapping => ({
  table,
  map: (row) => ({ ...base(row), [targetName]: text(row, sourceName) }),
});

const mappings: Record<string, Mapping> = {
  a_label: {
    table: "product_labels",
    map: (r) => ({
      ...base(r), product_legacy_id: text(r, "Product"),
      packing_material_legacy_id: text(r, "Packing"),
      display_name: text(r, "Display Name A"),
      quantity_label: text(r, "Display Name B"),
    }),
  },
  bento_mainingredients: simple(
    "bento_main_ingredients",
    "main ingredient",
  ),
  bento_maintype: simple("bento_main_types", "main type"),
  bento_numberofcolumn: simple(
    "bento_column_types",
    "no of column / type",
  ),
  bento_specialrequest: simple(
    "bento_special_requests",
    "special request",
  ),
  ds_bento_additionalitem: simple(
    "bento_additional_items",
    "item",
    "description",
  ),
  ds_bento_eventpart: simple(
    "bento_event_parts",
    "item",
    "description",
  ),
  ds_collection: {
    table: "product_collections",
    map: (r) => ({
      ...base(r), channel_legacy_id: text(r, "Channel"),
      name: text(r, "Display Name"), sort_order: number(r, "Rank"),
    }),
  },
  ds_cooktype: {
    table: "cook_types",
    map: (r) => ({
      ...base(r), name: text(r, "Type"),
      workload_score: number(r, "WorkloadScore"),
    }),
  },
  ds_cost_type: {
    table: "cost_types",
    map: (r) => ({
      ...base(r), name: text(r, "cost_type"),
      is_active: bool(r, "Active", true), is_advertising: bool(r, "ads"),
      is_brand: bool(r, "brand"),
    }),
  },
  ds_customer_tag_type: {
    table: "customer_tag_types",
    map: (r) => ({
      ...base(r), name: text(r, "customer tag type"),
      is_active: bool(r, "Active", true),
    }),
  },
  ds_customer_tag: {
    table: "customer_tags",
    map: (r) => ({
      ...base(r),
      customer_tag_type_legacy_id: text(r, "DS_customer_tag_type"),
      name: text(r, "tag"), is_active: bool(r, "Active", true),
    }),
  },
  ds_deliverysurcharge: {
    table: "delivery_surcharge_types",
    map: (r) => ({
      ...base(r), name: text(r, "charge_name"),
      is_active: bool(r, "active", true),
    }),
  },
  ds_festival: {
    table: "festivals",
    map: (r) => ({
      ...base(r), name: text(r, "Festival"),
      is_active: bool(r, "Active", true),
    }),
  },
  ds_purchasetype: {
    table: "purchase_types",
    map: (r) => ({
      ...base(r), name: text(r, "Type"),
      is_active: bool(r, "Active", true),
    }),
  },
  ds_quote_delivery: {
    table: "quote_delivery_templates",
    map: (r) => ({
      ...base(r), content: text(r, "display"),
      is_editable: bool(r, "editable"),
    }),
  },
  ds_quote_payment: {
    table: "quote_payment_templates",
    map: (r) => ({
      ...base(r), content: text(r, "display"),
      is_editable: bool(r, "editable"),
    }),
  },
  "ds_quote_t&c": {
    table: "quote_terms_templates",
    map: (r) => ({
      ...base(r), content: text(r, "display"),
      is_editable: bool(r, "editable"),
    }),
  },
  ds_salespartner: {
    table: "sales_partners",
    map: (r) => ({
      ...base(r), name: text(r, "Name"), phone: text(r, "Phone no."),
      is_active: bool(r, "active", true),
    }),
  },
  ds_super_motorcade_subdriver: {
    table: "delivery_team_drivers",
    map: (r) => ({
      ...base(r), delivery_team_legacy_id: text(r, "DS_Super_Motorcade"),
      display_name: text(r, "Display Name"),
      is_active: bool(r, "Active", true),
    }),
  },
  ds_tags: simple("product_tags", "Display Name"),
  ds_type: {
    table: "product_types",
    map: (r) => ({
      ...base(r), channel_legacy_id: text(r, "channel") ?? text(r, "Channel"),
      name: text(r, "Display Name"), sort_order: number(r, "Rank"),
    }),
  },
  dsao_blockdate: {
    table: "order_block_dates",
    map: (r) => ({ ...base(r), blocked_at: text(r, "blockDate") }),
  },
  dsaoproduct: {
    table: "channel_products",
    map: (r) => ({
      ...base(r), channel_legacy_id: text(r, "Channels"),
      product_legacy_id: text(r, "Product"),
    }),
  },
  "dscommuchannels(quote)": {
    table: "quote_communication_channels",
    map: (r) => ({
      ...base(r), name: text(r, "Channels"),
      is_active: bool(r, "Active", true),
    }),
  },
  "dsreminderperson(first)": {
    table: "quote_first_reminder_contacts",
    map: (r) => ({
      ...base(r), name: text(r, "name"), phone: text(r, "phone no."),
      reminder_hours: number(r, "hrs"),
    }),
  },
  "dsreminderperson(second)": {
    table: "quote_second_reminder_contacts",
    map: (r) => ({
      ...base(r), name: text(r, "name"), phone: text(r, "phone.no"),
      reminder_hours: number(r, "hrs"),
    }),
  },
  "dssourceofsales(quote)": {
    table: "quote_sales_sources",
    map: (r) => ({
      ...base(r), name: text(r, "Source"),
      is_active: bool(r, "Active", true),
    }),
  },
  osdriver_menu: simple("osdriver_menus", "Display Name"),
  print_label: {
    table: "print_labels",
    map: (r) => ({
      ...base(r), order_legacy_id: text(r, "A_order"),
      display_name: text(r, "Display Name"),
    }),
  },
  b_adscostweekly: {
    table: "advertising_costs",
    map: (r) => ({
      ...base(r), cost_type_legacy_id: text(r, "Ads_type"),
      channel_legacy_id: text(r, "Channel"),
      amount: number(r, "ads cost amount"),
      range_start: text(r, "RangeStart") ?? range(r, "Date_range(mon to sun)", 0),
      range_end: range(r, "Date_range(mon to sun)", 1),
      sorting_key: number(r, "dateText_forSorting"), remarks: text(r, "Remark"),
    }),
  },
  b_costmonthly: {
    table: "monthly_costs",
    map: (r) => ({
      ...base(r), cost_type_legacy_id: text(r, "cost_type"),
      primary_channel_legacy_id: text(r, "Ads_single Brand"),
      festival_legacy_id: text(r, "Festival"), month_at: text(r, "Month"),
      non_peak_amount: number(r, "Non-Peak Amount"),
      festival_amount: number(r, "Festival amount"),
      festival_range_start: range(r, "Festival Range", 0),
      festival_range_end: range(r, "Festival Range", 1),
      season: text(r, "OS season"), remarks: text(r, "Remark"),
    }),
  },
  b_supplierpurchase: {
    table: "supplier_purchases",
    map: (r) => ({
      ...base(r), supplier_legacy_id: text(r, "Supplier"),
      purchase_type_legacy_id: text(r, "DS_purchase_type"),
      purchased_at: text(r, "Date"), amount: number(r, "Amount"),
    }),
  },
  b_deliveryschedule_surcharge: {
    table: "delivery_surcharges",
    map: (r) => ({
      ...base(r), delivery_legacy_id: text(r, "B_delivery_schedule"),
      surcharge_type_legacy_id: text(r, "DS_delivery surchage"),
      amount: number(r, "Amount"),
    }),
  },
  s_paymentreport: {
    table: "payment_settlements",
    map: (r) => ({
      ...base(r), channel_legacy_id: text(r, "Channels"),
      payment_method_legacy_id: text(r, "Payment Method"),
      payout_at: text(r, "Payout date"), gross_amount: number(r, "total amount"),
      charges: number(r, "Charges"), net_amount: number(r, "Net Amount"),
    }),
  },
  s_packages_choiceset: {
    table: "package_choice_sets",
    map: (r) => ({
      ...base(r), package_legacy_id: text(r, "Package"),
      choice_type: text(r, "RealType"),
      maximum_choices: number(r, "Max Number"),
    }),
  },
  cal_control: {
    table: "production_calculations",
    map: (r) => ({
      ...base(r), order_legacy_id: text(r, "order"),
      package_legacy_id: text(r, "Package"),
      package_choice_set_legacy_id: text(r, "Package_Set"),
    }),
  },
  cal_package_choice: {
    table: "order_package_choice_snapshots",
    map: (r) => ({
      ...base(r), production_calculation_legacy_id: text(r, "Control"),
      order_legacy_id: text(r, "Order"), package_legacy_id: text(r, "Package"),
      package_product_legacy_id: text(r, "Package_Product"),
      package_choice_set_legacy_id: text(r, "S_Package_Choice"),
      product_type_legacy_id: text(r, "Type"),
      maximum_choices: number(r, "MaxNum"),
      is_selected: bool(r, "Selected"),
    }),
  },
  quote_bento_additionalitem: {
    table: "order_bento_additional_items",
    map: (r) => ({
      ...base(r), order_legacy_id: text(r, "A_order"),
      additional_item_legacy_id: text(r, "DS_addiction item ID"),
      description_snapshot: text(r, "additional item"),
      sort_order: number(r, "sort"),
    }),
  },
  quote_bento_eventpart: {
    table: "order_bento_event_parts",
    map: (r) => ({
      ...base(r), order_legacy_id: text(r, "A_order"),
      event_part_legacy_id: text(r, "ds_bento_event item"),
      description_snapshot: text(r, "quote_event item"),
      price_snapshot: number(r, "quote item_price"),
      sort_order: number(r, "sort"),
    }),
  },
  quote_paymentmethod: {
    table: "order_payment_method_snapshots",
    map: (r) => ({
      ...base(r), order_legacy_id: text(r, "A_order"),
      content: text(r, "method"),
    }),
  },
  "quote_t&c": {
    table: "order_terms_snapshots",
    map: (r) => ({
      ...base(r), order_legacy_id: text(r, "A_order"),
      content: text(r, "T&C"),
    }),
  },
  s_comment: {
    table: "order_timeline_entries",
    map: (r) => ({
      ...base(r), order_legacy_id: text(r, "A_order"),
      category: text(r, "category"), comment: text(r, "comment"),
      customer_email_snapshot: text(r, "customer email"),
    }),
  },
  s_customer_tag: {
    table: "customer_tag_assignments",
    map: (r) => ({
      ...base(r), customer_email_snapshot: text(r, "Email"),
      customer_tag_legacy_id: text(r, "tag"),
      customer_tag_type_legacy_id: text(r, "tag type"),
    }),
  },
  quote_file: {
    table: "quote_file_metadata",
    map: (r) => {
      const reference = text(r, "file");
      const cleanReference = reference?.split(/[?#]/, 1)[0] ?? null;
      const encodedName = cleanReference?.split("/").at(-1) ?? null;
      let sourceFileName = encodedName;
      try {
        sourceFileName = encodedName ? decodeURIComponent(encodedName) : null;
      } catch {
        // Keep the source filename when malformed percent encoding is present.
      }
      return {
        ...base(r), order_legacy_id: text(r, "A_order"),
        display_name: text(r, "Display name"),
        source_file_reference: cleanReference, source_file_name: sourceFileName,
      };
    },
  },
};

const upsertChildren = async (
  supabase: ReturnType<typeof createClient>,
  sourceType: string,
  rows: BubbleRow[],
) => {
  if (sourceType === "b_costmonthly") {
    const ids = rows.map((row) => text(row, "_id")).filter(Boolean) as string[];
    const { data: parents, error } = await supabase
      .from("monthly_costs").select("id,legacy_id").in("legacy_id", ids);
    if (error) throw error;
    const map = new Map(parents.map((parent) => [parent.legacy_id, parent.id]));
    const links = rows.flatMap((row) =>
      (Array.isArray(row.Channels) ? row.Channels : [])
        .filter((id): id is string => typeof id === "string")
        .map((channelLegacyId) => ({
          monthly_cost_id: map.get(text(row, "_id") ?? ""),
          monthly_cost_legacy_id: text(row, "_id"),
          channel_legacy_id: channelLegacyId,
        }))
    ).filter((link) => link.monthly_cost_id);
    if (links.length) {
      const result = await supabase.from("monthly_cost_channels").upsert(links, {
        onConflict: "monthly_cost_id,channel_legacy_id",
      });
      if (result.error) throw result.error;
    }
  }
  if (sourceType === "s_paymentreport") {
    const ids = rows.map((row) => text(row, "_id")).filter(Boolean) as string[];
    const { data: parents, error } = await supabase
      .from("payment_settlements").select("id,legacy_id").in("legacy_id", ids);
    if (error) throw error;
    const map = new Map(parents.map((parent) => [parent.legacy_id, parent.id]));
    const links = rows.flatMap((row) =>
      (Array.isArray(row.S_payment) ? row.S_payment : [])
        .filter((id): id is string => typeof id === "string")
        .map((paymentLegacyId) => ({
          payment_settlement_id: map.get(text(row, "_id") ?? ""),
          payment_settlement_legacy_id: text(row, "_id"),
          payment_legacy_id: paymentLegacyId,
        }))
    ).filter((link) => link.payment_settlement_id);
    if (links.length) {
      const result = await supabase.from("payment_settlement_payments")
        .upsert(links, {
          onConflict: "payment_settlement_id,payment_legacy_id",
        });
      if (result.error) throw result.error;
    }
  }
};

const backfill = async (
  supabase: ReturnType<typeof createClient>,
  sourceType: string,
  rows: BubbleRow[],
) => {
  if (sourceType === "a_products_backfill") {
    for (const row of rows) {
      const legacyId = text(row, "_id");
      if (!legacyId) continue;
      const result = await supabase.from("products").update({
        cook_type_legacy_id: text(row, "DS CookType"),
        product_type_legacy_id: text(row, "R_Type"),
        bento_main_type_legacy_id: text(row, "bento_main dish"),
        bento_column_type_legacy_id: text(row, "bento_no. of column"),
        is_bento_recommended: bool(row, "bento_recommend"),
      }).eq("legacy_id", legacyId).select("id").maybeSingle();
      if (result.error) throw result.error;
      const productId = result.data?.id;
      if (!productId) continue;
      const linkSpecs = [
        ["R_Collections", "product_collection_links", "collection_legacy_id"],
        ["bento_main ingre", "product_main_ingredient_links", "main_ingredient_legacy_id"],
        ["bento_special request", "product_special_request_links", "special_request_legacy_id"],
        ["R_Tags", "product_tag_links", "product_tag_legacy_id"],
      ] as const;
      for (const [source, table, legacyColumn] of linkSpecs) {
        const values = Array.isArray(row[source]) ? row[source] : [];
        const links = values.filter((id): id is string => typeof id === "string")
          .map((id) => ({
            product_id: productId, product_legacy_id: legacyId,
            [legacyColumn]: id,
          }));
        if (links.length) {
          const result = await supabase.from(table).upsert(links, {
            onConflict: `product_id,${legacyColumn}`,
          });
          if (result.error) throw result.error;
        }
      }
    }
    return;
  }
  if (sourceType === "a_orders_backfill") {
    for (const row of rows) {
      const result = await supabase.from("orders").update({
        festival_legacy_id: text(row, "Report_DS Festival"),
        sales_partner_legacy_id: text(row, "Sales Partner"),
        quote_communication_channel_legacy_id:
          text(row, "(Quote) Communication Channels"),
        quote_delivery_template_legacy_id: text(row, "(Quote) delivery text"),
        quote_sales_source_legacy_id: text(row, "(Quote) Source of Sales"),
      }).eq("legacy_id", text(row, "_id"));
      if (result.error) throw result.error;
    }
    return;
  }
  throw new Error(`Unsupported backfill ${sourceType}`);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const expectedToken = Deno.env.get("BUBBLE_REMAINING_IMPORT_TOKEN");
    if (!expectedToken ||
      request.headers.get("x-migration-token") !== expectedToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await request.json();
    const sourceType = body.sourceType as string;
    const rows = body.rows as BubbleRow[];
    if (!Array.isArray(rows) || rows.length > 250) {
      throw new Error("rows must be an array of at most 250 records");
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (sourceType.endsWith("_backfill")) {
      await backfill(supabase, sourceType, rows);
    } else {
      const mapping = mappings[sourceType];
      if (!mapping) throw new Error(`Unsupported source type ${sourceType}`);
      const values = rows.map(mapping.map);
      if (values.some((value) => !value.legacy_id)) {
        throw new Error("Every imported record must have a Bubble _id");
      }
      if (values.length) {
        const result = await supabase.from(mapping.table).upsert(values, {
          onConflict: "legacy_id",
        });
        if (result.error) throw result.error;
      }
      await upsertChildren(supabase, sourceType, rows);
    }
    return new Response(JSON.stringify({ sourceType, imported: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
