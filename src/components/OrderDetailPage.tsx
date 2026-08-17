import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ChevronLeft,
  FileText,
  Package,
  RefreshCw,
  Truck,
  WalletCards,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  fetchOrderDetail,
  type OrderDetailResult,
  type ReadOnlyOrderDetail,
} from "@/lib/order-details";
import { kitchenCalendarReturnPath } from "@/lib/kitchen-calendar";
import { kitchenOrdersReturnPath } from "@/lib/kitchen-orders";
import {
  DEFAULT_UNPAID_STATUS_COLOR,
  orderDetailTags,
  statusBadgeStyle,
} from "@/lib/order-statuses";
import { cn } from "@/lib/utils";

type DetailLoader = typeof fetchOrderDetail;

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function displayStatus(
  order: ReadOnlyOrderDetail,
  labels: Record<string, string>,
) {
  if (order.deliveryStatus === "己送達" || order.deliveryStatus === "已送達") {
    return { label: labels.completed, tone: "green" };
  }
  if (order.deliveryStatus === "送貨途中") {
    return { label: labels.shipping, tone: "blue" };
  }
  if (order.deliveryStatus === "待取貨") {
    return { label: labels.ready, tone: "green" };
  }
  if (order.deliveryStatus === "已取" || order.deliveryStatus === "已取貨") {
    return { label: labels.pickedUp, tone: "green" };
  }
  if (order.deliveryStatus === "待接單" || order.deliveryStatus === "未派車隊") {
    return { label: labels.awaitingDriver, tone: "amber" };
  }
  if (order.isSentToFactory) return { label: labels.preparing, tone: "amber" };
  return { label: labels.confirmed, tone: "blue" };
}

export function OrderDetailPage({
  documentType,
  canViewFinance,
  loadDetail = fetchOrderDetail,
}: {
  documentType: "order" | "quote";
  canViewFinance: boolean;
  loadDetail?: DetailLoader;
}) {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<OrderDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isQuote = documentType === "quote";
  const calendarBack = kitchenCalendarReturnPath(
    searchParams.get("from"),
    searchParams.get("month"),
  );
  const kitchenBack = kitchenOrdersReturnPath(searchParams.get("from"));
  const backTo =
    calendarBack ?? kitchenBack ?? (isQuote ? "/quotes" : "/orders");
  const backLabel = calendarBack
    ? t("details.backToCalendar")
    : kitchenBack
      ? t("details.backToKitchen")
      : t("details.back");
  const title = isQuote ? t("details.quoteTitle") : t("details.orderTitle");
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await loadDetail(id, documentType, canViewFinance));
    } catch (loadError) {
      setError(
        typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
          ? loadError.code
          : "detail_load_failed",
      );
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, documentType, id, loadDetail, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <PageSkeleton label={t("details.loading")} variant="detail" />;
  }

  if (error || !result?.order) {
    return (
      <div className="detail-state detail-state-error" role="alert">
        <FileText />
        <div>
          <strong>{t("details.notFound")}</strong>
          <span>{t("details.notFoundDescription")}</span>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw />
          {t("details.retry")}
        </Button>
      </div>
    );
  }

  const { order } = result;
  const status = isQuote
    ? { label: order.quoteStatus || t("details.draft"), tone: "amber" }
    : displayStatus(order, {
        confirmed: t("orders.statuses.confirmed"),
        preparing: t("orders.statuses.preparing"),
        ready: t("orders.statuses.ready"),
        pickedUp: t("orders.statuses.pickedUp"),
        shipping: t("orders.statuses.shipping"),
        completed: t("orders.statuses.completed"),
        awaitingDriver: t("dashboard.driverStatus"),
      });
  const tags = orderDetailTags(
    order.statuses,
    canViewFinance ? order.outstanding : null,
    {
      name: t("details.unpaidTag"),
      color: DEFAULT_UNPAID_STATUS_COLOR,
    },
  );
  const money = (value: number | null) =>
    value === null
      ? t("details.restricted")
      : order.currency === "HKD"
        ? currency.format(value)
        : `${order.currency} ${value.toLocaleString(i18n.language)}`;

  return (
    <section className="detail-page">
      <header className="page-heading">
        <div>
          <Link className="detail-back" to={backTo}>
            <ChevronLeft />
            {backLabel}
          </Link>
          <span className="eyebrow">{title}</span>
          <h1>{order.orderNumber || t("common.notSet")}</h1>
          <p>{order.companyName || order.customerName || t("common.notSet")}</p>
        </div>
        <div
          className="heading-actions order-status-list"
          aria-label={t("details.tags")}
        >
          <span className={cn("status-badge", status.tone)}>{status.label}</span>
          {tags.map((tag) => (
            <span
              key={tag.name}
              className={cn("status-badge", !tag.color && "red")}
              style={statusBadgeStyle(tag.color)}
            >
              {tag.name}
            </span>
          ))}
        </div>
      </header>

      <section className="detail-grid">
        <article className="panel detail-card">
          <header>
            <FileText />
            <h2>{t("details.customer")}</h2>
          </header>
          <div className="detail-fields">
            <DetailField label={t("details.name")}>
              {order.customerName || order.companyName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("details.company")}>
              {order.companyName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("details.email")}>
              {order.email || t("common.notSet")}
            </DetailField>
            <DetailField label={t("details.contact")}>
              {[order.contactA, order.contactB].filter(Boolean).join(" · ") ||
                t("common.notSet")}
            </DetailField>
            <DetailField label={t("details.address")}>
              {order.address || t("common.notSet")}
            </DetailField>
          </div>
        </article>

        <article className="panel detail-card">
          <header>
            <Truck />
            <h2>{t("details.fulfilment")}</h2>
          </header>
          <div className="detail-fields">
            <DetailField label={t("details.deliveryAt")}>
              {order.deliveryAt
                ? date.format(new Date(order.deliveryAt))
                : t("common.notSet")}
            </DetailField>
            <DetailField label={t("details.shipOut")}>
              {order.shipOutTime || t("common.notSet")}
            </DetailField>
            <DetailField label={t("details.factoryDate")}>
              {order.factoryDate
                ? date.format(new Date(order.factoryDate))
                : t("common.notSet")}
            </DetailField>
            <DetailField label={t("details.factoryNote")}>
              {order.factoryPackingNote || t("common.notSet")}
            </DetailField>
          </div>
        </article>

        <article className="panel detail-card">
          <header>
            <WalletCards />
            <h2>{t("details.financial")}</h2>
          </header>
          <div className="detail-fields">
            <DetailField label={t("details.grandTotal")}>
              {money(order.grandTotal)}
            </DetailField>
            <DetailField label={t("details.outstanding")}>
              {money(order.outstanding)}
            </DetailField>
            <DetailField label={t("details.discount")}>
              {canViewFinance
                ? money(order.discount)
                : t("details.restricted")}
            </DetailField>
            <DetailField label={t("details.shippingFee")}>
              {canViewFinance
                ? money(order.shippingFee)
                : t("details.restricted")}
            </DetailField>
          </div>
        </article>
      </section>

      {isQuote && (
        <section className="detail-grid detail-grid-two">
          <article className="panel detail-card">
            <header>
              <FileText />
              <h2>{t("details.quoteDescription")}</h2>
            </header>
            <p className="detail-copy">
              {order.quoteDescription || t("common.notSet")}
            </p>
          </article>
          <article className="panel detail-card">
            <header>
              <FileText />
              <h2>{t("details.terms")}</h2>
            </header>
            <div className="detail-stack">
              {result.terms.length
                ? result.terms.map((term, index) => <p key={index}>{term}</p>)
                : t("common.notSet")}
            </div>
          </article>
        </section>
      )}

      <article className="panel detail-table-panel">
        <header className="panel-header">
          <div>
            <h2>
              <Package /> {t("details.lineItems")}
            </h2>
            <p>{t("details.lineItemsDescription")}</p>
          </div>
        </header>
        <PullToRefresh
          className="table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          refreshing={loading}
        >
          <table>
            <thead>
              <tr>
                <th>{t("details.item")}</th>
                <th>{t("details.sku")}</th>
                <th>{t("details.quantity")}</th>
                {canViewFinance && <th>{t("details.unitPrice")}</th>}
                {canViewFinance && <th>{t("details.total")}</th>}
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.productName || line.content || t("common.notSet")}</strong>
                    {line.remarks && (
                      <small className="settings-cell-detail">{line.remarks}</small>
                    )}
                  </td>
                  <td>{line.sku || t("common.notSet")}</td>
                  <td>{line.quantity ?? t("common.notSet")}</td>
                  {canViewFinance && <td>{money(line.unitPrice)}</td>}
                  {canViewFinance && <td>{money(line.totalPrice)}</td>}
                </tr>
              ))}
              {!result.lines.length && (
                <tr>
                  <td colSpan={canViewFinance ? 5 : 3} className="dashboard-empty-row">
                    {t("details.emptyLines")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </PullToRefresh>
      </article>

      {!isQuote && (
        <article className="panel detail-table-panel">
          <header className="panel-header">
            <div>
              <h2>{t("details.payments")}</h2>
              <p>{t("details.paymentsDescription")}</p>
            </div>
          </header>
          {canViewFinance ? (
            <PullToRefresh
              className="table-wrap"
              onRefresh={() => setReloadKey((key) => key + 1)}
              refreshing={loading}
            >
              <table>
                <thead>
                  <tr>
                    <th>{t("details.paymentDate")}</th>
                    <th>{t("details.amount")}</th>
                    <th>{t("details.reference")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {payment.paymentAt
                          ? date.format(new Date(payment.paymentAt))
                          : t("common.notSet")}
                      </td>
                      <td>{money(payment.amount)}</td>
                      <td>{payment.reference || t("common.notSet")}</td>
                    </tr>
                  ))}
                  {!result.payments.length && (
                    <tr>
                      <td colSpan={3} className="dashboard-empty-row">
                        {t("details.emptyPayments")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </PullToRefresh>
          ) : (
            <p className="detail-restricted">{t("details.restricted")}</p>
          )}
        </article>
      )}
    </section>
  );
}
