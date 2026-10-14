import { useState } from "react";
import { useOutletContext, useParams, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { archivePortalTemplate, formatMenuPeriod, hongKongToday, menuValidUntil, savePortalTemplate } from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

const money = (cents: number) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(cents / 100);

export function CustomerMenusPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { menuId } = useParams();
  const {
    t, menu, quantities, setQuantities, serviceDate, setServiceDate, addressId, setAddressId,
    busy, requestId, chooseMenu, applyTemplate, cart, checkout, setPage, refresh, run,
  } = portal;
  const data = portal.data;
  const [templateName, setTemplateName] = useState("");
  if (!data) return null;
  if (menuId && !menu) return <Navigate to="/customer/menus" replace />;
  const templates = data.templates ?? [];
  const cartItems = cart?.items ?? [];

  return (
    <section>
      <h1>{menu ? menu.name : t("portal.menus")}</h1>
      {!menu ? (
        <>
          {data.menus.map(row => (
            <div className="portal-row" key={row.id}>
              <div>
                <strong>{row.brand} · {row.name}</strong>
                <p>{formatMenuPeriod(row)} · {row.delivery_time}</p>
              </div>
              <Button onClick={() => chooseMenu(row)}>{t("portal.choose")}</Button>
            </div>
          ))}
          <h2>{t("portal.templates")}</h2>
          {templates.length === 0 ? <p>{t("portal.noTemplates")}</p> : null}
          {templates.map(template => (
            <div className="portal-row" key={template.id}>
              <div>
                <strong>{template.name}</strong>
                <p>{template.items.map(item => `${item.name} × ${item.quantity}`).join("、")}</p>
              </div>
              <div className="portal-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || data.menus.length === 0}
                  onClick={() => applyTemplate(template)}
                >
                  {t("portal.applyTemplate")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await archivePortalTemplate(template.id, data.organization.id);
                    await refresh();
                  }, t("portal.templateArchived"))}
                >
                  {t("portal.deleteTemplate")}
                </Button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <p>{menu.brand} · {formatMenuPeriod(menu)} · {menu.delivery_time}</p>
          {menu.items.map(item => (
            <div className="portal-row" key={item.id}>
              <label>
                <strong>{item.name}</strong>
                <span>{money(Math.round(Number(item.unit_price) * 100))} · {t("portal.available", { count: item.available_quantity })}</span>
              </label>
              <input
                aria-label={t("portal.quantityLabel", { name: item.name })}
                type="number"
                min={0}
                max={item.available_quantity}
                step={1}
                value={quantities[item.product_id] || 0}
                onChange={e => {
                  requestId.current = null;
                  setQuantities({ ...quantities, [item.product_id]: Number(e.target.value) });
                }}
              />
            </div>
          ))}
          <div className="portal-checkout">
            <div className="portal-service-date">
              <label>
                {t("portal.serviceDate")}
                <input
                  type="date"
                  required
                  min={hongKongToday() > menu.delivery_date ? hongKongToday() : menu.delivery_date}
                  max={menuValidUntil(menu)}
                  value={serviceDate}
                  onChange={event => { requestId.current = null; setServiceDate(event.target.value); }}
                />
              </label>
              <small>{t("portal.serviceDateHint")}</small>
            </div>
            <label>
              {t("portal.addresses")}
              <select value={addressId} onChange={e => { requestId.current = null; setAddressId(e.target.value); }}>
                <option value="">{t("portal.chooseAddress")}</option>
                {data.addresses.map(a => <option key={a.id} value={a.id}>{a.label} · {a.address}</option>)}
              </select>
            </label>
            {!data.addresses.length && (
              <Button variant="outline" onClick={() => setPage("addresses")}>{t("portal.addAddress")}</Button>
            )}
            <p>{t("portal.pointsHint")}</p>
            <p>{t("portal.shipping")}: {money(Math.round(Number(menu.shipping_fee) * 100))}</p>
            <strong>{t("portal.payable")}: {money(cart?.payableCents || 0)}</strong>
            <Button disabled={busy || !cart?.valid || !addressId || !serviceDate} onClick={() => void checkout()}>
              {busy ? t("portal.submitting") : t("portal.confirmOrder")}
            </Button>
            <label>
              {t("portal.templateName")}
              <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder={t("portal.templateNamePlaceholder")} />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !templateName.trim() || cartItems.length === 0}
              onClick={() => void run(async () => {
                await savePortalTemplate(templateName.trim(), cartItems, data.organization.id);
                setTemplateName("");
                await refresh();
              }, t("portal.templateSaved"))}
            >
              {t("portal.saveTemplate")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
