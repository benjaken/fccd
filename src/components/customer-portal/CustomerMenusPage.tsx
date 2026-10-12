import { useOutletContext, useParams, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
const money = (cents: number) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(cents / 100);

export function CustomerMenusPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { menuId } = useParams();
  const {t, menu, quantities, setQuantities, points, setPoints, addressId, setAddressId, busy, address, requestId, chooseMenu, cart, checkout, setPage} = portal;
  const data = portal.data;
  if (!data) return null;
  if (menuId && !menu) return <Navigate to="/customer/menus" replace />;
  return <section><h1>{menu?menu.name:t("portal.menus")}</h1>{!menu?data.menus.map(m=><div className="portal-row" key={m.id}><div><strong>{m.brand} · {m.name}</strong><p>{m.delivery_date} · {m.delivery_time}</p></div><Button onClick={()=>chooseMenu(m)}>{t("portal.choose")}</Button></div>):<><p>{menu.brand} · {menu.delivery_date} · {menu.delivery_time}</p>
          {menu.items.map(item=><div className="portal-row" key={item.id}><label><strong>{item.name}</strong><span>{money(Math.round(Number(item.unit_price)*100))} · {t("portal.available",{count:item.available_quantity})}</span></label><input aria-label={t("portal.quantityLabel",{name:item.name})} type="number" min={0} max={item.available_quantity} step={1} value={quantities[item.product_id]||0} onChange={e=>{requestId.current=null;setQuantities({...quantities,[item.product_id]:Number(e.target.value)});}}/></div>)}
          <div className="portal-checkout"><label>{t("portal.addresses")}<select value={addressId} onChange={e=>{requestId.current=null;setAddressId(e.target.value);}}><option value="">{t("portal.chooseAddress")}</option>{data.addresses.map(a=><option key={a.id} value={a.id}>{a.label} · {a.address}</option>)}</select></label>
            {!data.addresses.length&&<Button variant="outline" onClick={()=>setPage("addresses")}>{t("portal.addAddress")}</Button>}
            <label>{t("portal.usePoints")}<input type="number" min={0} step={10} value={points} onChange={e=>{requestId.current=null;setPoints(Number(e.target.value));}}/></label><p>{t("portal.pointsHint")}</p>
            <p>{t("portal.shipping")}: {money(Math.round(Number(menu.shipping_fee)*100))}</p><strong>{t("portal.payable")}: {money(cart?.payableCents||0)}</strong>
            <Button disabled={busy||!cart?.valid||!addressId} onClick={()=>void checkout()}>{busy?t("portal.submitting"):t("portal.confirmOrder")}</Button></div></>}</section>;
}
