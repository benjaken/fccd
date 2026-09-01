import { supabase } from "@/lib/supabase";

export type OrderReconciliationRun = {
  runDate: string;
  scopeStart: string;
  shopifyCount: number;
  fccdMatchedCount: number;
  missingFccdCount: number;
  unlinkedFccdCount: number;
  factoryUnsentCount: number;
  urgentCount: number;
};

export type OrderReconciliationIssue = {
  id: string;
  issueType: "missing_fccd" | "unlinked_fccd" | "factory_unsent" | "missing_service_time";
  severity: "normal" | "important" | "urgent";
  serviceAt: string | null;
  orderId: string;
  orderNumber: string | null;
  customerName: string | null;
  storeDomain: string | null;
  deliveryAt: string | null;
  deliveryTime: string | null;
  address: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean;
  doNotSendToFactory: boolean;
};

export type OrderReconciliationExcludedOrder = {
  orderId: string;
  orderNumber: string | null;
  customerName: string | null;
  storeDomain: string | null;
  deliveryAt: string | null;
  deliveryTime: string | null;
  address: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean;
  doNotSendToFactory: boolean;
  exclusionReasons: string[];
};

type RunRow = {
  run_date: string;
  scope_start: string;
  shopify_count: number;
  fccd_matched_count: number;
  missing_fccd_count: number;
  unlinked_fccd_count: number;
  factory_unsent_count: number;
  urgent_count: number;
};

type IssueRow = {
  id: string;
  issue_type: OrderReconciliationIssue["issueType"];
  severity: OrderReconciliationIssue["severity"];
  service_at: string | null;
  order_id: string;
  orders: OrderSummaryRow | OrderSummaryRow[] | null;
  shopify_stores: { shop_domain?: string | null } | Array<{ shop_domain?: string | null }> | null;
};

type OrderSummaryRow = {
  id?: string;
  order_number?: string | null;
  customer_name_snapshot?: string | null;
  company_name_snapshot?: string | null;
  delivery_at?: string | null;
  factory_date?: string | null;
  delivery_time?: string | null;
  shipping_address_snapshot?: string | null;
  delivery_status?: string | null;
  is_sent_to_factory?: boolean | null;
  do_not_send_to_factory?: boolean | null;
  shopify_stores?: { shop_domain?: string | null } | Array<{ shop_domain?: string | null }> | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function fetchOrderReconciliationSummary(): Promise<{
  run: OrderReconciliationRun | null;
  issues: OrderReconciliationIssue[];
  excludedOrders: OrderReconciliationExcludedOrder[];
}> {
  const [runResult, issueResult, excludedResult] = await Promise.all([
    supabase.from("order_reconciliation_runs")
      .select("run_date,scope_start,shopify_count,fccd_matched_count,missing_fccd_count,unlinked_fccd_count,factory_unsent_count,urgent_count")
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("order_reconciliation_issues")
      .select("id,issue_type,severity,service_at,order_id,orders(order_number,customer_name_snapshot,company_name_snapshot,delivery_at,delivery_time,shipping_address_snapshot,delivery_status,is_sent_to_factory,do_not_send_to_factory),shopify_stores(shop_domain)")
      .eq("status", "open")
      .order("service_at", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase.from("orders")
      .select("id,order_number,customer_name_snapshot,company_name_snapshot,factory_date,delivery_at,delivery_time,shipping_address_snapshot,delivery_status,is_sent_to_factory,do_not_send_to_factory,shopify_stores(shop_domain)")
      .eq("document_type", "order")
      .is("archived_at", null)
      .is("merged_into_order_id", null)
      .eq("source_system", "shopify")
      .not("shopify_order_id", "is", null)
      .order("delivery_at", { ascending: true, nullsFirst: false })
      .limit(500),
  ]);
  if (runResult.error) throw runResult.error;
  if (issueResult.error) throw issueResult.error;
  if (excludedResult.error) throw excludedResult.error;

  const runRow = runResult.data as RunRow | null;
  const scopeStart = runRow?.scope_start ?? null;
  const excludedOrders = ((excludedResult.data ?? []) as unknown as OrderSummaryRow[])
    .filter((order) => {
      const reconciliationDate = order.factory_date ?? order.delivery_at;
      return !scopeStart || !reconciliationDate || reconciliationDate.slice(0, 10) >= scopeStart;
    })
    .map((order): OrderReconciliationExcludedOrder | null => {
      const normalizedOrderNumber = (order.order_number ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const reasons = [
        normalizedOrderNumber === "B1523" ? "B-1523 已知例外" : null,
        order.do_not_send_to_factory ? "已標記不需送工場" : null,
        order.is_sent_to_factory ? "已送工場" : null,
        order.delivery_status ? `已有營運狀態：${order.delivery_status}` : null,
      ].filter((reason): reason is string => Boolean(reason));
      if (!reasons.length) return null;
      return {
        orderId: order.id ?? "",
        orderNumber: order.order_number ?? null,
        customerName: order.customer_name_snapshot ?? order.company_name_snapshot ?? null,
        storeDomain: one(order.shopify_stores)?.shop_domain ?? null,
        deliveryAt: order.delivery_at ?? null,
        deliveryTime: order.delivery_time ?? null,
        address: order.shipping_address_snapshot ?? null,
        deliveryStatus: order.delivery_status ?? null,
        isSentToFactory: Boolean(order.is_sent_to_factory),
        doNotSendToFactory: Boolean(order.do_not_send_to_factory),
        exclusionReasons: reasons,
      };
    })
    .filter((order): order is OrderReconciliationExcludedOrder => order !== null);

  return {
    run: runRow ? {
      runDate: runRow.run_date,
      scopeStart: runRow.scope_start,
      shopifyCount: runRow.shopify_count,
      fccdMatchedCount: runRow.fccd_matched_count,
      missingFccdCount: runRow.missing_fccd_count,
      unlinkedFccdCount: runRow.unlinked_fccd_count,
      factoryUnsentCount: runRow.factory_unsent_count,
      urgentCount: runRow.urgent_count,
    } : null,
    issues: ((issueResult.data ?? []) as unknown as IssueRow[]).map((row) => {
      const order = one(row.orders);
      const store = one(row.shopify_stores);
      return {
        id: row.id,
        issueType: row.issue_type,
        severity: row.severity,
        serviceAt: row.service_at,
        orderId: row.order_id,
        orderNumber: order?.order_number ?? null,
        customerName: order?.customer_name_snapshot ?? order?.company_name_snapshot ?? null,
        storeDomain: store?.shop_domain ?? null,
        deliveryAt: order?.delivery_at ?? null,
        deliveryTime: order?.delivery_time ?? null,
        address: order?.shipping_address_snapshot ?? null,
        deliveryStatus: order?.delivery_status ?? null,
        isSentToFactory: Boolean(order?.is_sent_to_factory),
        doNotSendToFactory: Boolean(order?.do_not_send_to_factory),
      };
    }),
    excludedOrders,
  };
}
