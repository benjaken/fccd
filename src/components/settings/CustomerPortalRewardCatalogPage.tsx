import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { fulfillRewardRedemption, listRewardCatalogOps, listRewardRedemptions, upsertRewardCatalogItem, type RewardCatalogOpsItem, type RewardRedemption } from "@/lib/customer-reward-catalog";
import { linkShopifyCustomer } from "@/lib/shopify-customer-bridge";
import { supabase } from "@/lib/supabase";
import "@/lib/customer-portal-i18n";

function failure(error: unknown) {
  const text = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (text.includes("page_access_required")) return "portalRewardCatalog.accessDenied";
  if (text.includes("invalid_catalog_item")) return "portalRewardCatalog.invalid";
  if (text.includes("redemption_not_pending")) return "portalRewardCatalog.notPending";
  if (text.includes("invalid_shopify_customer")) return "portalRewardCatalog.invalid";
  return "portalRewardCatalog.failed";
}

export function CustomerPortalRewardCatalogPage() {
  const { t } = useTranslation();
  const canEdit = useCurrentPageAccess().canAccess("settings.customer_portal.edit");
  const [items, setItems] = useState<RewardCatalogOpsItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"gift" | "voucher">("gift");
  const [points, setPoints] = useState("100");
  const [stock, setStock] = useState("10");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [amount, setAmount] = useState("");
  const [storeId, setStoreId] = useState("");
  const [validDays, setValidDays] = useState("365");
  const [stores, setStores] = useState<Array<{ id: string; shop_domain: string }>>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [ownerType, setOwnerType] = useState<"user" | "organization">("user");
  const [ownerId, setOwnerId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [linkStoreId, setLinkStoreId] = useState("");

  const load = useCallback(async () => {
    const [catalog, claims] = await Promise.all([listRewardCatalogOps(), listRewardRedemptions()]);
    setItems(catalog ?? []);
    setRedemptions(claims ?? []);
  }, []);
  useEffect(() => { void load().catch(reason => setError(t(failure(reason)))); }, [load, t]);
  useEffect(() => {
    void supabase.from("shopify_stores").select("id,shop_domain").eq("is_active", true).order("shop_domain")
      .then(({ data }) => setStores((data ?? []) as Array<{ id: string; shop_domain: string }>));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    try {
      await upsertRewardCatalogItem({
        id: editing, name, kind, points: Number(points), description, stock: Number(stock), active,
        voucherAmount: amount ? Number(amount) : null, storeId: storeId || null, validDays: Number(validDays) || 365,
      });
      setName(""); setDescription(""); setAmount(""); setStoreId(""); setEditing(null); setNotice(t("portalRewardCatalog.saved"));
      await load();
    } catch (reason) { setError(t(failure(reason))); }
  }

  return <section>
    <p><Link to="/settings/customer-portal">{t("portalRewardCatalog.back")}</Link></p>
    <h1>{t("navigation.customerPortalRewardCatalog")}</h1>
    <p>{t("portalRewardCatalog.intro")}</p>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {canEdit ? <form onSubmit={event => void save(event)}>
      <label htmlFor="catalog-name">{t("portalRewardCatalog.name")}</label>
      <input id="catalog-name" value={name} onChange={event => setName(event.target.value)} required />
      <label htmlFor="catalog-kind">{t("portalRewardCatalog.kind")}</label>
      <select id="catalog-kind" value={kind} onChange={event => setKind(event.target.value === "voucher" ? "voucher" : "gift")}>
        <option value="gift">{t("portalRewardCatalog.gift")}</option>
        <option value="voucher">{t("portalRewardCatalog.voucher")}</option>
      </select>
      <label htmlFor="catalog-points">{t("portalRewardCatalog.points")}</label>
      <input id="catalog-points" inputMode="numeric" value={points} onChange={event => setPoints(event.target.value)} required />
      <label htmlFor="catalog-stock">{t("portalRewardCatalog.stock")}</label>
      <input id="catalog-stock" inputMode="numeric" value={stock} onChange={event => setStock(event.target.value)} required />
      {kind === "voucher" ? <>
        <label htmlFor="catalog-amount">{t("portalVoucher.amount")}</label>
        <input id="catalog-amount" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
        <label htmlFor="catalog-store">{t("portalVoucher.store")}</label>
        <select id="catalog-store" value={storeId} onChange={event => setStoreId(event.target.value)}>
          <option value="">{t("portalVoucher.noStore")}</option>
          {stores.map(store => <option key={store.id} value={store.id}>{store.shop_domain}</option>)}
        </select>
        <label htmlFor="catalog-days">{t("portalVoucher.validDays")}</label>
        <input id="catalog-days" inputMode="numeric" value={validDays} onChange={event => setValidDays(event.target.value)} />
      </> : null}
      <label htmlFor="catalog-description">{t("portalRewardCatalog.description")}</label>
      <textarea id="catalog-description" value={description} onChange={event => setDescription(event.target.value)} />
      <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> {t("portalRewardCatalog.active")}</label>
      <Button type="submit">{editing ? t("portalRewardCatalog.save") : t("portalRewardCatalog.create")}</Button>
    </form> : null}
    {canEdit ? <form onSubmit={event => {
      event.preventDefault();
      setError(""); setNotice("");
      void linkShopifyCustomer({ ownerType, ownerId, storeId: linkStoreId, customerId })
        .then(() => setNotice(t("portalVoucher.linked")))
        .catch(reason => setError(t(failure(reason))));
    }}>
      <h2>{t("portalVoucher.linkTitle")}</h2>
      <p>{t("portalVoucher.linkIntro")}</p>
      <label htmlFor="link-owner-type">{t("portalVoucher.ownerType")}</label>
      <select id="link-owner-type" value={ownerType} onChange={event => setOwnerType(event.target.value === "organization" ? "organization" : "user")}>
        <option value="user">{t("portalVoucher.user")}</option>
        <option value="organization">{t("portalVoucher.organization")}</option>
      </select>
      <label htmlFor="link-owner">{t("portalVoucher.ownerId")}</label>
      <input id="link-owner" value={ownerId} onChange={event => setOwnerId(event.target.value)} required />
      <label htmlFor="link-store">{t("portalVoucher.store")}</label>
      <select id="link-store" value={linkStoreId} onChange={event => setLinkStoreId(event.target.value)} required>
        <option value="" />
        {stores.map(store => <option key={store.id} value={store.id}>{store.shop_domain}</option>)}
      </select>
      <label htmlFor="link-customer">{t("portalVoucher.customerId")}</label>
      <input id="link-customer" value={customerId} onChange={event => setCustomerId(event.target.value)} required />
      <Button type="submit">{t("portalVoucher.link")}</Button>
    </form> : null}
    <h2>{t("portalRewardCatalog.items")}</h2>
    {items.length ? items.map(item => <div className="portal-row" key={item.id}><div><strong>{item.name}</strong><p>{t(item.kind === "voucher" ? "portalRewardCatalog.voucher" : "portalRewardCatalog.gift")} · {item.points_cost} · {t("portalRewardCatalog.stock")} {item.stock}{item.voucher_amount_hkd ? ` · HK$${Number(item.voucher_amount_hkd).toFixed(0)}` : ""}{item.is_active ? "" : ` · ${t("portalRewardCatalog.inactive")}`}</p></div>{canEdit ? <Button type="button" variant="outline" onClick={() => { setEditing(item.id); setName(item.name); setKind(item.kind); setPoints(String(item.points_cost)); setStock(String(item.stock)); setDescription(item.description); setActive(item.is_active); setAmount(item.voucher_amount_hkd ? String(item.voucher_amount_hkd) : ""); setStoreId(item.shopify_store_id ?? ""); setValidDays(String(item.voucher_valid_days ?? 365)); }}>{t("portalRewardCatalog.edit")}</Button> : null}</div>) : <p>{t("portalRewardCatalog.empty")}</p>}
    <h2>{t("portalRewardCatalog.redemptions")}</h2>
    {redemptions.length ? redemptions.map(row => <div className="portal-row" key={row.id}><div><strong>{row.account}</strong><p>{row.name} · {row.points} · {t(row.status === "fulfilled" ? "portalRewardCatalog.fulfilled" : "portalRewardCatalog.pending")}{row.voucher_status ? ` · ${t(`portalVoucher.${row.voucher_status}`)}` : ""}{row.voucher_last4 ? ` · ${row.voucher_last4}` : ""}</p></div>{canEdit && row.status === "pending" ? <Button type="button" variant="outline" onClick={() => void fulfillRewardRedemption(row.id).then(() => load()).catch(reason => setError(t(failure(reason))))}>{t("portalRewardCatalog.fulfill")}</Button> : null}</div>) : <p>{t("portalRewardCatalog.noRedemptions")}</p>}
  </section>;
}
