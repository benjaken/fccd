import { Link, useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
import { exportPortalOrders, portalPermissions } from "@/lib/customer-portal";

export function CustomerOrdersPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { data, t, run } = portal;
  if (!data) return null;
  return <section><h1>{t("portal.orders")}</h1>
    {portalPermissions(data).export ? <Button variant="outline" onClick={() => void run(async () => {
      const csv = await exportPortalOrders(data.organization.id);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = "orders.csv"; link.click();
      URL.revokeObjectURL(url);
    }, t("portal.exported"))}>{t("portal.exportOrders")}</Button> : null}
    {!data.orders.length && <p>{t("portal.noOrders")}</p>}
    {data.orders.map(order => <article className="portal-order" key={order.id}>
      <div className="portal-row"><div><strong>{order.number} · {order.brand}</strong><p>{new Date(order.delivery_at).toLocaleDateString("zh-HK",{timeZone:"Asia/Hong_Kong"})} · {order.stage === "quote" ? t("portal.awaitingConfirmation") : (order.status || t("portal.confirmed"))}</p></div>
        <Button variant="outline" asChild><Link to={`/customer/orders/${encodeURIComponent(order.id)}`}>{t("portal.details")}</Link></Button>
      </div>
    </article>)}
  </section>;
}
