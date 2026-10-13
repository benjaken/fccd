import { Link, useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerOrdersPage() {
  const { data, t } = useOutletContext<CustomerPortalController>();
  if (!data) return null;
  return <section><h1>{t("portal.orders")}</h1>
    {!data.orders.length && <p>{t("portal.noOrders")}</p>}
    {data.orders.map(order => <article className="portal-order" key={order.id}>
      <div className="portal-row"><div><strong>{order.number} · {order.brand}</strong><p>{new Date(order.delivery_at).toLocaleDateString("zh-HK",{timeZone:"Asia/Hong_Kong"})} · {order.stage === "quote" ? t("portal.awaitingConfirmation") : (order.status || t("portal.confirmed"))}</p></div>
        <Button variant="outline" asChild><Link to={`/customer/orders/${encodeURIComponent(order.id)}`}>{t("portal.details")}</Link></Button>
      </div>
    </article>)}
  </section>;
}
