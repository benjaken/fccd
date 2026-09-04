import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { cn } from "@/lib/utils";
import {
  fetchOrderReconciliationSummary,
  type OrderReconciliationIssue,
  type OrderReconciliationExcludedOrder,
  type OrderReconciliationRun,
} from "@/lib/order-reconciliation";
import "@/components/order-reconciliation-summary.css";

const ISSUE_LABELS: Record<OrderReconciliationIssue["issueType"], string> = {
  missing_fccd: "Shopify有單，FCCD尚未正式輸入",
  unlinked_fccd: "FCCD訂單尚未連結Shopify",
  factory_unsent: "尚未傳送廚房",
  missing_service_time: "缺少出餐時間",
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Hong_Kong",
});

function DetailGrid({
  item,
}: {
  item: OrderReconciliationIssue | OrderReconciliationExcludedOrder;
}) {
  const deliveryAt = item.deliveryAt ? dateTimeFormatter.format(new Date(item.deliveryAt)) : "未設定";
  return (
    <dl className="order-reconciliation-detail-grid">
      <div><dt>客戶</dt><dd>{item.customerName || "未提供"}</dd></div>
      <div><dt>Shopify 店舖</dt><dd>{item.storeDomain || "未連結店舖"}</dd></div>
      <div><dt>送貨日期</dt><dd>{deliveryAt}</dd></div>
      <div><dt>送貨時間</dt><dd>{item.deliveryTime || "未設定"}</dd></div>
      <div><dt>營運狀態</dt><dd>{item.deliveryStatus || "未設定"}</dd></div>
      <div><dt>工場狀態</dt><dd>{item.doNotSendToFactory ? "不需送工場" : item.isSentToFactory ? "已送工場" : "未送工場"}</dd></div>
      <div className="is-wide"><dt>送貨地址</dt><dd>{item.address || "未提供"}</dd></div>
    </dl>
  );
}

export function OrderReconciliationSummary() {
  const [run, setRun] = useState<OrderReconciliationRun | null>(null);
  const [issues, setIssues] = useState<OrderReconciliationIssue[]>([]);
  const [excludedOrders, setExcludedOrders] = useState<OrderReconciliationExcludedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      setError(false);
      const next = await fetchOrderReconciliationSummary();
      if (!aliveRef.current) return;
      setRun(next.run);
      setIssues(next.issues);
      setExcludedOrders(next.excludedOrders);
    } catch {
      if (!aliveRef.current) return;
      setError(true);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const urgentCount = issues.filter((issue) => issue.severity === "urgent").length;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "order-reconciliation-trigger",
          issues.length > 0 && "is-warning",
          urgentCount > 0 && "is-urgent",
        )}
        onClick={() => setOpen(true)}
        aria-label={`漏單核對${issues.length ? `，${issues.length}項未解決` : ""}`}
      >
        {loading ? <RefreshCw className="spin" /> : issues.length ? <AlertTriangle /> : <CheckCircle2 />}
        漏單核對
        {issues.length ? <span className="order-reconciliation-trigger-count">{issues.length}</span> : null}
      </Button>

      <SidePanel
        open={open}
        title="Shopify與FCCD漏單核對"
        description={run
          ? `核對範圍：${run.scopeStart} 至所有未來訂單｜最後核對：${run.runDate}`
          : "核對範圍：香港今日往前一個月至所有未來訂單"}
        closeLabel="關閉漏單核對"
        onClose={() => setOpen(false)}
        half
        className="order-reconciliation-panel"
        footer={<Button type="button" onClick={() => setOpen(false)}>關閉</Button>}
      >
        <section className="order-reconciliation-dialog-content" aria-label="漏單核對結果">
          <div className="order-reconciliation-dialog-toolbar">
            <strong>{issues.length ? `${issues.length} 項未解決問題` : "核對結果"}</strong>
            <Button type="button" variant="ghost" size="icon" disabled={loading} aria-label="重新載入核對結果" onClick={() => void load()}>
              <RefreshCw className={loading ? "spin" : undefined} />
            </Button>
          </div>

          {error ? <p className="order-reconciliation-error">暫時無法載入核對結果。</p> : null}
          {!error && run ? (
            <div className="order-reconciliation-metrics">
              <span><small>Shopify訂單</small><strong>{run.shopifyCount}</strong></span>
              <span><small>FCCD已配對</small><strong>{run.fccdMatchedCount}</strong></span>
              <span className={run.missingFccdCount ? "has-warning" : undefined}><small>FCCD漏單</small><strong>{run.missingFccdCount}</strong></span>
              <span className={run.unlinkedFccdCount ? "has-warning" : undefined}><small>未連結</small><strong>{run.unlinkedFccdCount}</strong></span>
              <span className={run.factoryUnsentCount ? "has-warning" : undefined}><small>未傳廚房</small><strong>{run.factoryUnsentCount}</strong></span>
              <span className={run.urgentCount ? "has-urgent" : undefined}><small>6小時內緊急</small><strong>{run.urgentCount}</strong></span>
              <span className="is-excluded"><small>已排除</small><strong>{excludedOrders.length}</strong></span>
            </div>
          ) : null}

          <p className="order-reconciliation-explanation">
            <CircleSlash2 />
            已送工場、已有營運狀態、不需送工場及 B-1523 已知例外會列在「已排除」，不計入 FCCD 漏單；因此 Shopify 訂單不一定等於已配對加漏單。
          </p>

          {!loading && !error && issues.length === 0 ? (
            <p className="order-reconciliation-clear"><CheckCircle2 />目前沒有未解決漏單問題。</p>
          ) : null}
          {issues.length > 0 ? (
            <section className="order-reconciliation-section" aria-labelledby="order-reconciliation-open-title">
              <h3 id="order-reconciliation-open-title">未解決問題（{issues.length}）</h3>
              <div className="order-reconciliation-items">
                {issues.map((issue) => (
                  <article className={issue.severity === "urgent" ? "is-urgent" : undefined} key={issue.id}>
                    <header>
                      <AlertTriangle />
                      <div><strong>{issue.orderNumber || "未編號訂單"}</strong><small>{ISSUE_LABELS[issue.issueType]}</small></div>
                      <Link to={`/orders/${issue.orderId}`} aria-label={`查看訂單 ${issue.orderNumber || "未編號訂單"}`}>查看訂單</Link>
                    </header>
                    <DetailGrid item={issue} />
                    <div className="order-reconciliation-reason">
                      <strong>具體原因</strong>
                      <span className="order-reconciliation-reason-status">
                        {ISSUE_LABELS[issue.issueType]}{issue.serviceAt ? `（出餐 ${dateTimeFormatter.format(new Date(issue.serviceAt))}）` : ""}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {excludedOrders.length > 0 ? (
            <section className="order-reconciliation-section" aria-labelledby="order-reconciliation-excluded-title">
              <h3 id="order-reconciliation-excluded-title">已排除，不計入漏單（{excludedOrders.length}）</h3>
              <div className="order-reconciliation-items is-excluded-list">
                {excludedOrders.map((order) => (
                  <article key={order.orderId}>
                    <header>
                      <CircleSlash2 />
                      <div><strong>{order.orderNumber || "未編號訂單"}</strong><small>{order.customerName || "未提供客戶名稱"}</small></div>
                      <Link to={`/orders/${order.orderId}`} aria-label={`查看訂單 ${order.orderNumber || "未編號訂單"}`}>查看訂單</Link>
                    </header>
                    <DetailGrid item={order} />
                    <div className="order-reconciliation-reason">
                      <strong>具體原因</strong>
                      <div className="order-reconciliation-reason-status-list">
                        {order.exclusionReasons.map((reason) => (
                          <span className="order-reconciliation-reason-status" key={reason}>{reason}</span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </SidePanel>
    </>
  );
}
