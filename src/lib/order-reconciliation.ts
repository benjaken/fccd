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
  orders: { order_number?: string | null; customer_name_snapshot?: string | null; company_name_snapshot?: string | null } | Array<{ order_number?: string | null; customer_name_snapshot?: string | null; company_name_snapshot?: string | null }> | null;
  shopify_stores: { shop_domain?: string | null } | Array<{ shop_domain?: string | null }> | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function fetchOrderReconciliationSummary(): Promise<{
  run: OrderReconciliationRun | null;
  issues: OrderReconciliationIssue[];
}> {
  const [runResult, issueResult] = await Promise.all([
    supabase.from("order_reconciliation_runs")
      .select("run_date,scope_start,shopify_count,fccd_matched_count,missing_fccd_count,unlinked_fccd_count,factory_unsent_count,urgent_count")
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("order_reconciliation_issues")
      .select("id,issue_type,severity,service_at,order_id,orders(order_number,customer_name_snapshot,company_name_snapshot),shopify_stores(shop_domain)")
      .eq("status", "open")
      .order("service_at", { ascending: true, nullsFirst: false })
      .limit(100),
  ]);
  if (runResult.error) throw runResult.error;
  if (issueResult.error) throw issueResult.error;

  const runRow = runResult.data as RunRow | null;
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
      };
    }),
  };
}
