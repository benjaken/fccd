import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  fetchOrderReconciliationSummary,
  type OrderReconciliationIssue,
  type OrderReconciliationRun,
} from "@/lib/order-reconciliation";
import "@/components/order-reconciliation-summary.css";

const ISSUE_LABELS: Record<OrderReconciliationIssue["issueType"], string> = {
  missing_fccd: "Shopify有單，FCCD尚未正式輸入",
  unlinked_fccd: "FCCD訂單尚未連結Shopify",
  factory_unsent: "尚未傳送廚房",
  missing_service_time: "缺少出餐時間",
};

export function OrderReconciliationSummary() {
  const [run, setRun] = useState<OrderReconciliationRun | null>(null);
  const [issues, setIssues] = useState<OrderReconciliationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const next = await fetchOrderReconciliationSummary();
      setRun(next.run);
      setIssues(next.issues);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="order-reconciliation-summary" aria-label="Shopify與FCCD漏單核對">
      <header>
        <div>
          <h2>Shopify與FCCD漏單核對</h2>
          <p>
            {run
              ? `核對範圍：${run.scopeStart} 至所有未來訂單｜最後核對：${run.runDate}`
              : "核對範圍：香港今日往前一個月至所有未來訂單"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" disabled={loading} aria-label="重新載入核對結果" onClick={() => void load()}>
          <RefreshCw className={loading ? "spin" : undefined} />
        </Button>
      </header>

      {error ? <p className="order-reconciliation-error">暫時無法載入核對結果。</p> : null}
      {!error && run ? (
        <div className="order-reconciliation-metrics">
          <span><small>Shopify訂單</small><strong>{run.shopifyCount}</strong></span>
          <span><small>FCCD已配對</small><strong>{run.fccdMatchedCount}</strong></span>
          <span className={run.missingFccdCount ? "has-warning" : undefined}><small>FCCD漏單</small><strong>{run.missingFccdCount}</strong></span>
          <span className={run.unlinkedFccdCount ? "has-warning" : undefined}><small>未連結</small><strong>{run.unlinkedFccdCount}</strong></span>
          <span className={run.factoryUnsentCount ? "has-warning" : undefined}><small>未傳廚房</small><strong>{run.factoryUnsentCount}</strong></span>
          <span className={run.urgentCount ? "has-urgent" : undefined}><small>6小時內緊急</small><strong>{run.urgentCount}</strong></span>
        </div>
      ) : null}

      {!loading && !error && issues.length === 0 ? (
        <p className="order-reconciliation-clear"><CheckCircle2 />目前沒有未解決漏單問題。</p>
      ) : null}
      {issues.length > 0 ? (
        <div className="order-reconciliation-issues">
          {issues.slice(0, 10).map((issue) => (
            <Link className={issue.severity === "urgent" ? "is-urgent" : undefined} to={`/orders/${issue.orderId}`} key={issue.id}>
              <AlertTriangle />
              <span>
                <strong>{issue.orderNumber || "未編號訂單"}</strong>
                <small>{ISSUE_LABELS[issue.issueType]}{issue.customerName ? `｜${issue.customerName}` : ""}</small>
              </span>
              <time>{issue.serviceAt ? new Intl.DateTimeFormat("zh-HK", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Hong_Kong" }).format(new Date(issue.serviceAt)) : "時間未設定"}</time>
            </Link>
          ))}
          {issues.length > 10 ? <small className="order-reconciliation-more">另外還有 {issues.length - 10} 項問題</small> : null}
        </div>
      ) : null}
    </section>
  );
}
