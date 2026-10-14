import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import { fulfillRewardRedemption, listRewardCatalogOps, fetchRewardRedemptionPage, upsertRewardCatalogItem, type RewardCatalogOpsItem, type RewardRedemption } from "@/lib/customer-reward-catalog";
import { linkShopifyCustomer } from "@/lib/shopify-customer-bridge";
import { supabase } from "@/lib/supabase";
import "@/lib/customer-portal-i18n";
import "@/lib/customer-reward-admin-i18n";
import "./customer-portal-reward-catalog.css";

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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  const [storeError, setStoreError] = useState(false);
  const [linking, setLinking] = useState(false);
  const [actionError, setActionError] = useState("");
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
  const [panel, setPanel] = useState<"editor" | "catalog" | "link" | null>(null);

  function resetEditor() {
    setEditing(null); setName(""); setDescription(""); setAmount(""); setStoreId("");
    setKind("gift"); setPoints("100"); setStock("10"); setActive(true); setValidDays("365"); setActionError("");
  }
  function openCreate() {
    resetEditor();
    setPanel("editor");
  }
  function openEdit(item: RewardCatalogOpsItem) {
    setEditing(item.id); setName(item.name); setKind(item.kind); setPoints(String(item.points_cost));
    setStock(String(item.stock)); setDescription(item.description); setActive(item.is_active);
    setAmount(String(item.voucher_amount_hkd ?? "")); setStoreId(item.shopify_store_id ?? "");
    setValidDays(String(item.voucher_valid_days ?? 365)); setActionError(""); setPanel("editor");
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
    const [catalog, claims] = await Promise.all([listRewardCatalogOps(), fetchRewardRedemptionPage(page)]);
    setItems(catalog ?? []);
    setRedemptions(claims.rows); setTotal(claims.total); setPage(claims.page);
    } catch (reason) { setError(t(failure(reason))); } finally { setLoading(false); }
  }, [page, t]);
  useEffect(() => { void load().catch(reason => setError(t(failure(reason)))); }, [load, t]);
  const loadStores = useCallback(() => {
    setStoreError(false);
    void Promise.resolve(supabase.from("shopify_stores").select("id,shop_domain").eq("is_active", true).order("shop_domain"))
      .then(({ data, error: reason }) => { setStoreError(Boolean(reason)); setStores((data ?? []) as Array<{ id: string; shop_domain: string }>); })
      .catch(() => setStoreError(true));
  }, []);
  useEffect(loadStores, [loadStores]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setActionError(""); setNotice("");
    if (!name.trim() || !Number.isSafeInteger(Number(points)) || Number(points) <= 0 || !Number.isSafeInteger(Number(stock)) || Number(stock) < 0 || (kind === "voucher" && (Number(amount) <= 0 || !Number.isFinite(Number(amount)) || !Number.isSafeInteger(Number(validDays)) || Number(validDays) <= 0))) { setActionError(t("portalRewardCatalog.invalid")); return; }
    if (saving) return;
    setSaving(true);
    try {
      await upsertRewardCatalogItem({
        id: editing, name: name.trim(), kind, points: Number(points), description, stock: Number(stock), active,
        voucherAmount: amount ? Number(amount) : null, storeId: storeId || null, validDays: Number(validDays) || 365,
      });
      resetEditor(); setPanel(null); setNotice(t("portalRewardCatalog.saved"));
      await load();
    } catch (reason) { setActionError(t(failure(reason))); } finally { setSaving(false); }
  }

  return <section className="reward-admin">
    <header className="page-heading"><div className="reward-admin-actions">
      {canEdit ? <Button type="button" onClick={openCreate}>{t("portalRewardCatalog.create")}</Button> : null}
      <Button type="button" variant="outline" onClick={() => setPanel("catalog")}>{t("portalRewardCatalog.items")}</Button>
      {canEdit ? <Button type="button" variant="outline" onClick={() => { setActionError(""); setPanel("link"); }}>{t("portalVoucher.linkTitle")}</Button> : null}
    </div></header>
    {error ? <div className="reward-admin-error" role="alert">{error} <Button variant="outline" disabled={loading} onClick={() => void load().catch(reason => setError(t(failure(reason))))}>{t("portal.retry")}</Button></div> : null}
    {actionError && panel !== "editor" && panel !== "link" ? <p className="reward-admin-error" role="alert">{actionError}</p> : null}
    {notice ? <p className="reward-admin-notice" role="status">{notice}</p> : null}
    {canEdit ? <SidePanel wide open={panel === "editor"} title={editing ? t("portalRewardCatalog.edit") : t("portalRewardCatalog.create")} onClose={() => { if (!saving) { resetEditor(); setPanel(null); } }} closeLabel={t("portalOps.close")} footer={<>{editing ? <Button type="button" variant="outline" disabled={saving} onClick={() => { resetEditor(); setPanel(null); }}>{t("portalRewardAdmin.cancelEdit")}</Button> : null}<Button type="submit" form="catalog-editor-form" disabled={saving} aria-busy={saving}>{editing ? t("portalRewardCatalog.save") : t("portalRewardCatalog.create")}</Button></>}>
      <form id="catalog-editor-form" className="reward-admin-form reward-admin-panel-form" onSubmit={event => void save(event)}>
      {actionError ? <p className="reward-admin-error" role="alert">{actionError}</p> : null}
      <div className="reward-admin-field"><label htmlFor="catalog-name">{t("portalRewardCatalog.name")}</label><Input id="catalog-name" value={name} onChange={event => setName(event.target.value)} required /></div>
      <div className="reward-admin-field"><label htmlFor="catalog-kind">{t("portalRewardCatalog.kind")}</label><select id="catalog-kind" value={kind} onChange={event => setKind(event.target.value === "voucher" ? "voucher" : "gift")}>
        <option value="gift">{t("portalRewardCatalog.gift")}</option>
        <option value="voucher">{t("portalRewardCatalog.voucher")}</option>
      </select></div>
      <div className="reward-admin-field"><label htmlFor="catalog-points">{t("portalRewardCatalog.points")}</label><Input id="catalog-points" type="number" min="1" step="1" inputMode="numeric" value={points} onChange={event => setPoints(event.target.value)} required /></div>
      <div className="reward-admin-field"><label htmlFor="catalog-stock">{t("portalRewardCatalog.stock")}</label><Input id="catalog-stock" type="number" min="0" step="1" inputMode="numeric" value={stock} onChange={event => setStock(event.target.value)} required /></div>
      {kind === "voucher" ? <>
        {storeError ? <p role="alert">{t("portalRewardAdmin.storeFailed")} <Button type="button" variant="outline" onClick={loadStores}>{t("portal.retry")}</Button></p> : null}
        <div className="reward-admin-field"><label htmlFor="catalog-amount">{t("portalVoucher.amount")}</label><Input id="catalog-amount" required type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></div>
        <div className="reward-admin-field"><label htmlFor="catalog-store">{t("portalVoucher.store")}</label><select id="catalog-store" value={storeId} onChange={event => setStoreId(event.target.value)}>
          <option value="">{t("portalVoucher.noStore")}</option>
          {stores.map(store => <option key={store.id} value={store.id}>{store.shop_domain}</option>)}
        </select></div>
        <div className="reward-admin-field"><label htmlFor="catalog-days">{t("portalVoucher.validDays")}</label><Input id="catalog-days" required type="number" min="1" step="1" inputMode="numeric" value={validDays} onChange={event => setValidDays(event.target.value)} /></div>
      </> : null}
      <div className="reward-admin-field"><label htmlFor="catalog-description">{t("portalRewardCatalog.description")}</label><textarea id="catalog-description" value={description} onChange={event => setDescription(event.target.value)} /></div>
      <label className="reward-admin-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> {t("portalRewardCatalog.active")}</label>
    </form></SidePanel> : null}
    <SidePanel wide open={panel === "catalog"} title={t("portalRewardCatalog.items")} onClose={() => setPanel(null)} closeLabel={t("portalOps.close")}>
    <section className="reward-admin-catalog">
    {loading ? <PageSkeleton label={t("portalCatalog.loading")} variant="profile" compact /> : error ? <p>{t("portalRewardCatalog.failed")}</p> : items.length ? items.map(item => <article className="reward-admin-item" key={item.id}><div><h3>{item.name}</h3><p>{t(item.kind === "gift" ? "portalRewardCatalog.gift" : "portalRewardCatalog.voucher")} · {item.points_cost} · {t("portalRewardCatalog.stock")} {item.stock} · {t(item.is_active ? "portalRewardCatalog.active" : "portalRewardCatalog.inactive")}</p><p>{item.description}</p>{item.voucher_amount_hkd ? <p>HK$ {Number(item.voucher_amount_hkd).toFixed(2)}</p> : null}</div>{canEdit ? <Button variant="outline" disabled={saving} onClick={() => openEdit(item)}>{t("portalRewardCatalog.edit")}</Button> : null}</article>) : <div className="reward-admin-empty">{t("portalRewardCatalog.empty")}</div>}
    </section>
    </SidePanel>
    {canEdit ? <SidePanel wide open={panel === "link"} title={t("portalVoucher.linkTitle")} description={t("portalVoucher.linkIntro")} onClose={() => { if (!linking) setPanel(null); }} closeLabel={t("portalOps.close")} footer={<Button type="submit" form="catalog-link-form" disabled={linking || !stores.length || storeError} aria-busy={linking}>{t("portalVoucher.link")}</Button>}>
      <form id="catalog-link-form" className="reward-admin-form reward-admin-panel-form" onSubmit={event => {
      event.preventDefault();
      setActionError(""); setNotice("");
      if (linking) return;
      setLinking(true);
      void linkShopifyCustomer({ ownerType, ownerId, storeId: linkStoreId, customerId })
        .then(() => { setNotice(t("portalVoucher.linked")); setPanel(null); })
        .catch(reason => setActionError(t(failure(reason))))
        .finally(() => setLinking(false));
    }}>
      {actionError ? <p className="reward-admin-error" role="alert">{actionError}</p> : null}
      {storeError ? <p role="alert">{t("portalRewardAdmin.storeFailed")} <Button type="button" variant="outline" onClick={loadStores}>{t("portal.retry")}</Button></p> : !stores.length ? <p>{t("portalRewardAdmin.noStores")}</p> : null}
      <div className="reward-admin-field"><label htmlFor="link-owner-type">{t("portalVoucher.ownerType")}</label><select id="link-owner-type" value={ownerType} onChange={event => setOwnerType(event.target.value === "organization" ? "organization" : "user")}>
        <option value="user">{t("portalVoucher.user")}</option>
        <option value="organization">{t("portalVoucher.organization")}</option>
      </select></div>
      <div className="reward-admin-field"><label htmlFor="link-owner">{t("portalVoucher.ownerId")}</label><Input id="link-owner" value={ownerId} onChange={event => setOwnerId(event.target.value)} required /></div>
      <div className="reward-admin-field"><label htmlFor="link-store">{t("portalVoucher.store")}</label><select id="link-store" value={linkStoreId} onChange={event => setLinkStoreId(event.target.value)} required>
        <option value="">{t("portalRewardAdmin.storePlaceholder")}</option>
        {stores.map(store => <option key={store.id} value={store.id}>{store.shop_domain}</option>)}
      </select></div>
      <div className="reward-admin-field"><label htmlFor="link-customer">{t("portalVoucher.customerId")}</label><Input id="link-customer" value={customerId} onChange={event => setCustomerId(event.target.value)} required /></div>
    </form></SidePanel> : null}
    <section className="panel reward-admin-records">
    <h2>{t("portalRewardCatalog.redemptions")}</h2>
    <ListTable loading={loading} loadingLabel={t("portalCatalog.loading")} skeletonColumns={3} onRefresh={() => load().catch(reason => setError(t(failure(reason))))}
      header={<tr><th>{t("portalVoucher.ownerId")}</th><th>{t("portalRewardCatalog.items")}</th><th>{t("orders.columns.actions")}</th></tr>}>
      {redemptions.map(row => <tr key={row.id}><td>{row.account}</td><td>{row.name} · {row.points} · {t(row.status === "fulfilled" ? "portalRewardCatalog.fulfilled" : "portalRewardCatalog.pending")}{row.voucher_status ? ` · ${t(`portalVoucher.${row.voucher_status}`)}` : ""}{row.voucher_last4 ? ` · ${row.voucher_last4}` : ""}</td><td className="table-actions-cell">{canEdit && row.status === "pending" ? <Button type="button" variant="outline" disabled={fulfilling !== null} aria-busy={fulfilling === row.id} onClick={() => { setFulfilling(row.id); setActionError(""); void fulfillRewardRedemption(row.id).then(() => load()).catch(reason => setActionError(t(failure(reason)))).finally(() => setFulfilling(null)); }}>{t("portalRewardCatalog.fulfill")}</Button> : null}</td></tr>)}
      {!redemptions.length ? <tr><td colSpan={3}>{error ? t("portalRewardCatalog.failed") : t("portalRewardCatalog.noRedemptions")}</td></tr> : null}
    </ListTable>
    <TablePagination summary={t("orders.pagination", {from: total ? (page-1)*15+1 : 0, to:Math.min(page*15,total),total})}
      page={page} totalPages={Math.max(1,Math.ceil(total/15))} loading={loading}
      onPrevious={() => setPage(current=>Math.max(1,current-1))} onNext={() => setPage(current=>Math.min(Math.max(1,Math.ceil(total/15)),current+1))}
      onPageChange={setPage} previousLabel={t("orders.previous")} nextLabel={t("orders.next")} pageLabel={t("orders.pageOf")} jumpLabel={t("orders.jumpToPage")} />
    </section>
  </section>;
}
