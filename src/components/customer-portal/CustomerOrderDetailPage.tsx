import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { requestPortalCancellation } from "@/lib/customer-portal";
import { AccountOrderFeedback } from "@/components/customer-portal/OrderFeedbackPage";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerOrderDetailPage() {
  const { orderId } = useParams();
  const { data, t, busy, run, refresh, chooseMenu } = useOutletContext<CustomerPortalController>();
  if (!data) return null;
  const order = data.orders.find(item => item.id === orderId);
  if (!order) return <Navigate to="/customer/orders" replace />;
  const repeatMenu = data.menus.find(menu => menu.brand === order.brand);
  return <section>
    <Link to="/customer/orders">{t("portal.backToOrders")}</Link>
    <h1>{order.number}</h1><p>{order.brand} · {order.stage === "quote" ? t("portal.awaitingConfirmation") : (order.status || t("portal.confirmed"))}</p>
    <p>{new Date(order.delivery_at).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}</p>
    {order.lines.map((line,index) => <div className="portal-row" key={index}><span>{line.name} × {line.quantity}</span><strong>HK${(Number(line.unit_price)*line.quantity).toFixed(2)}</strong></div>)}
    <p>{t("portal.payable")}: HK${Number(order.outstanding).toFixed(2)} · {Number(order.outstanding)<=0 ? t("portal.settled") : t("portal.awaitingPayment")}</p>
    <AccountOrderFeedback orderId={order.id} />
    <div className="portal-actions">
      <Button variant="outline" disabled={!repeatMenu} onClick={() => {if(repeatMenu) chooseMenu(repeatMenu,order);}}>{t("portal.reorder")}</Button>
      <Button variant="outline" asChild><Link to="/customer/receipts">{t("portal.receipts")}</Link></Button>
      <Button variant="outline" disabled={busy || Boolean(order.cancel_status) || ["已取消","己取消","取消","已送達","己送達","送貨途中"].includes(order.status || "")} onClick={() => {
        const reason=window.prompt(t("portal.cancelReason"));
        if(reason) void run(async()=>{await requestPortalCancellation(order.id,reason);await refresh();},t("portal.cancelRequested"));
      }}>{order.cancel_status ? t("portal.cancelPending") : t("portal.requestCancel")}</Button>
    </div>
  </section>;
}
