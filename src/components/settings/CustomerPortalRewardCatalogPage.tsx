import { DragEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  buildRewardCatalogImagePrompt,
  fulfillRewardRedemption,
  generateRewardCatalogImage,
  listRewardCatalogOps,
  fetchRewardRedemptionPage,
  rewardCatalogImageUrl,
  uploadRewardCatalogImage,
  upsertRewardCatalogItem,
  type RewardCatalogOpsItem,
  type RewardRedemption,
} from "@/lib/customer-reward-catalog";
import { linkShopifyCustomer } from "@/lib/shopify-customer-bridge";
import { supabase } from "@/lib/supabase";
import "@/lib/customer-portal-i18n";
import "@/lib/customer-reward-admin-i18n";
import "./customer-portal-reward-catalog.css";

function failure(error: unknown) {
  const text = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (text.includes("page_access_required")) return "portalRewardCatalog.accessDenied";
  if (text.includes("invalid_catalog_item")) return "portalRewardCatalog.invalid";
  if (text.includes("invalid_catalog_image") || text.includes("image_generation") || text.includes("image_provider")) {
    return "portalRewardCatalog.imageFailed";
  }
  if (text.includes("redemption_not_pending")) return "portalRewardCatalog.notPending";
  if (text.includes("invalid_shopify_customer")) return "portalRewardCatalog.invalid";
  return "portalRewardCatalog.failed";
}

export function CustomerPortalRewardCatalogPage() {
  const { t } = useTranslation();
  const canEdit = useCurrentPageAccess().canAccess("settings.customer_portal.edit");
  const [items, setItems] = useState<RewardCatalogOpsItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
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
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageTab, setImageTab] = useState<"upload" | "ai">("upload");
  const [aiPrompt, setAiPrompt] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [stores, setStores] = useState<Array<{ id: string; shop_domain: string }>>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [ownerType, setOwnerType] = useState<"user" | "organization">("user");
  const [ownerId, setOwnerId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [linkStoreId, setLinkStoreId] = useState("");
  const [panel, setPanel] = useState<"editor" | "redemptions" | "link" | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  function resetEditor() {
    setEditing(null); setName(""); setDescription(""); setAmount(""); setStoreId("");
    setKind("gift"); setPoints("100"); setStock("10"); setActive(true); setValidDays("365");
    setImagePath(null); setImagePreview(""); setImageBusy(false); setImageTab("upload");
    setAiPrompt(""); setDragOver(false); setActionError("");
  }

  function syncAiPrompt(prize = name, detail = description) {
    setAiPrompt(buildRewardCatalogImagePrompt({ name: prize.trim(), description: detail }));
  }

  function openAiTab() {
    syncAiPrompt();
    setImageTab("ai");
  }

  function clearImage() {
    setImagePath(null);
    setImagePreview("");
  }
  async function hydrateImage(path: string | null | undefined) {
    if (!path) { setImagePath(null); setImagePreview(""); return; }
    setImagePath(path);
    try { setImagePreview(await rewardCatalogImageUrl(path)); }
    catch { setImagePreview(""); }
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
    void hydrateImage(item.image_object_path);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
    const [catalog, claims] = await Promise.all([listRewardCatalogOps(), fetchRewardRedemptionPage(page)]);
    setItems(catalog ?? []);
    setRedemptions(claims.rows); setTotal(claims.total); setPage(claims.page);
    const entries = await Promise.all((catalog ?? []).map(async item => {
      if (!item.image_object_path) return null;
      try { return [item.id, await rewardCatalogImageUrl(item.image_object_path)] as const; }
      catch { return null; }
    }));
    setPreviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
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

  async function onUpload(file: File | null | undefined) {
    if (!file || imageBusy || saving) return;
    setImageBusy(true); setActionError("");
    try {
      const path = await uploadRewardCatalogImage(file);
      setImagePath(path);
      setImagePreview(URL.createObjectURL(file));
    } catch (reason) { setActionError(t(failure(reason))); }
    finally { setImageBusy(false); }
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(true);
  }

  async function onGenerate() {
    const prize = name.trim();
    const prompt = aiPrompt.trim() || buildRewardCatalogImagePrompt({ name: prize, description });
    if (imageBusy || saving || !prize) {
      if (!prize) setActionError(t("portalRewardCatalog.invalid"));
      return;
    }
    setImageBusy(true); setActionError("");
    try {
      const result = await generateRewardCatalogImage({ name: prize, description, prompt });
      setImagePath(result.objectPath);
      setImagePreview(result.signedUrl);
    } catch (reason) { setActionError(t(failure(reason))); }
    finally { setImageBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setActionError(""); setNotice("");
    const detail = description.slice(0, 500);
    if (!name.trim() || !Number.isSafeInteger(Number(points)) || Number(points) <= 0 || !Number.isSafeInteger(Number(stock)) || Number(stock) < 0 || (kind === "voucher" && (Number(amount) <= 0 || !Number.isFinite(Number(amount)) || !Number.isSafeInteger(Number(validDays)) || Number(validDays) <= 0))) { setActionError(t("portalRewardCatalog.invalid")); return; }
    if (saving || imageBusy) return;
    setSaving(true);
    try {
      await upsertRewardCatalogItem({
        id: editing, name: name.trim(), kind, points: Number(points), description: detail, stock: Number(stock), active,
        voucherAmount: amount ? Number(amount) : null, storeId: storeId || null, validDays: Number(validDays) || 365,
        imageObjectPath: imagePath,
      });
      resetEditor(); setPanel(null); setNotice(t("portalRewardCatalog.saved"));
      await load();
    } catch (reason) { setActionError(t(failure(reason))); } finally { setSaving(false); }
  }

  const editorBusy = saving || imageBusy;
  const closeEditor = () => { if (!editorBusy) { resetEditor(); setPanel(null); } };
  const previewBlock = <div className="reward-admin-image-preview-wrap">
    {imagePreview ? <img className="reward-admin-image-preview" src={imagePreview} alt="" /> : <div className="reward-admin-image-preview-empty">{t("portalRewardCatalog.imageDrop")}</div>}
    {imagePath ? <button type="button" className="reward-admin-image-remove" disabled={editorBusy} aria-label={t("portalRewardCatalog.removeImage")} onClick={clearImage}><Trash2 aria-hidden="true" /></button> : null}
  </div>;

  return <section className="reward-admin">
    <header className="page-heading"><div className="reward-admin-actions">
      {canEdit ? <Button type="button" onClick={openCreate}>{t("portalRewardCatalog.create")}</Button> : null}
      <Button type="button" variant="outline" onClick={() => { setActionError(""); setPanel("redemptions"); }}>{t("portalRewardCatalog.redemptions")}</Button>
      {canEdit ? <Button type="button" variant="outline" onClick={() => { setActionError(""); setPanel("link"); }}>{t("portalVoucher.linkTitle")}</Button> : null}
    </div></header>
    {error ? <div className="reward-admin-error" role="alert">{error} <Button variant="outline" disabled={loading} onClick={() => void load().catch(reason => setError(t(failure(reason))))}>{t("portal.retry")}</Button></div> : null}
    {actionError && panel !== "editor" && panel !== "link" && panel !== "redemptions" ? <p className="reward-admin-error" role="alert">{actionError}</p> : null}
    {notice ? <p className="reward-admin-notice" role="status">{notice}</p> : null}
    {canEdit ? <SidePanel half open={panel === "editor"} title={editing ? t("portalRewardCatalog.edit") : t("portalRewardCatalog.create")} onClose={closeEditor} closeLabel={t("portalOps.close")} footer={
      <div className="reward-admin-editor-footer">
        <label className="reward-admin-checkbox"><input type="checkbox" form="catalog-editor-form" checked={active} onChange={event => setActive(event.target.checked)} /> {t("portalRewardCatalog.active")}</label>
        <div className="reward-admin-editor-footer-actions">
          <Button type="button" variant="outline" disabled={editorBusy} onClick={closeEditor}>{t("portalRewardCatalog.cancel")}</Button>
          <Button type="submit" form="catalog-editor-form" disabled={editorBusy} aria-busy={saving}>{editing ? t("portalRewardCatalog.save") : t("portalRewardCatalog.create")}</Button>
        </div>
      </div>
    }>
      <form id="catalog-editor-form" className="reward-admin-editor" onSubmit={event => void save(event)}>
      {actionError ? <p className="reward-admin-error" role="alert">{actionError}</p> : null}

      <section className="reward-admin-section">
        <h3 className="reward-admin-section-title">{t("portalRewardCatalog.sectionBasics")}</h3>
        <div className="reward-admin-section-body reward-admin-section-grid">
          <div className="reward-admin-field"><label htmlFor="catalog-name">{t("portalRewardCatalog.name")}</label><Input id="catalog-name" value={name} onChange={event => { const next = event.target.value; setName(next); if (imageTab === "ai") syncAiPrompt(next); }} required /></div>
          <div className="reward-admin-field"><label htmlFor="catalog-kind">{t("portalRewardCatalog.kind")}</label><select id="catalog-kind" value={kind} onChange={event => setKind(event.target.value === "voucher" ? "voucher" : "gift")}>
            <option value="gift">{t("portalRewardCatalog.gift")}</option>
            <option value="voucher">{t("portalRewardCatalog.voucher")}</option>
          </select></div>
          <div className="reward-admin-field"><label htmlFor="catalog-points">{t("portalRewardCatalog.points")}</label><Input id="catalog-points" type="number" min="1" step="1" inputMode="numeric" value={points} onChange={event => setPoints(event.target.value)} required /></div>
          <div className="reward-admin-field"><label htmlFor="catalog-stock">{t("portalRewardCatalog.stock")}</label><Input id="catalog-stock" type="number" min="0" step="1" inputMode="numeric" value={stock} onChange={event => setStock(event.target.value)} required /></div>
          {kind === "voucher" ? <>
            <div className="reward-admin-field"><label htmlFor="catalog-amount">{t("portalVoucher.amount")}</label><Input id="catalog-amount" required type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></div>
            <div className="reward-admin-field"><label htmlFor="catalog-days">{t("portalVoucher.validDays")}</label><Input id="catalog-days" required type="number" min="1" step="1" inputMode="numeric" value={validDays} onChange={event => setValidDays(event.target.value)} /></div>
          </> : null}
        </div>
      </section>

      {kind === "voucher" ? <section className="reward-admin-section">
        <h3 className="reward-admin-section-title">{t("portalRewardCatalog.sectionStore")}</h3>
        <div className="reward-admin-section-body">
          {storeError ? <p role="alert">{t("portalRewardAdmin.storeFailed")} <Button type="button" variant="outline" onClick={loadStores}>{t("portal.retry")}</Button></p> : null}
          <div className="reward-admin-field"><label htmlFor="catalog-store">{t("portalVoucher.store")}</label><select id="catalog-store" value={storeId} onChange={event => setStoreId(event.target.value)}>
            <option value="">{t("portalVoucher.noStore")}</option>
            {stores.map(store => <option key={store.id} value={store.id}>{store.shop_domain}</option>)}
          </select></div>
        </div>
      </section> : null}

      <section className="reward-admin-section" aria-labelledby="catalog-image-label">
        <h3 className="reward-admin-section-title" id="catalog-image-label">{t("portalRewardCatalog.sectionImage")}</h3>
        <div className="reward-admin-section-body">
          <p className="reward-admin-section-note">{t("portalRewardCatalog.imageHint")}</p>
          <div className="reward-admin-image-tabs" role="tablist" aria-labelledby="catalog-image-label">
            <button type="button" role="tab" aria-selected={imageTab === "upload"} className={imageTab === "upload" ? "is-active" : undefined} disabled={editorBusy} onClick={() => setImageTab("upload")}>{t("portalRewardCatalog.imageTabUpload")}</button>
            <button type="button" role="tab" aria-selected={imageTab === "ai"} className={imageTab === "ai" ? "is-active" : undefined} disabled={editorBusy} onClick={openAiTab}>{t("portalRewardCatalog.imageTabAi")}</button>
          </div>
          {imageTab === "upload" ? <div role="tabpanel" className="reward-admin-image-media">
            <label className="reward-admin-drop">
              <span
                className={dragOver ? "reward-admin-drop-target is-over" : "reward-admin-drop-target"}
                onDragEnter={allowDrop}
                onDragOver={allowDrop}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setDragOver(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  void onUpload(event.dataTransfer.files?.[0]);
                }}
              >
                <strong>{t("portalRewardCatalog.imageDrop")}</strong>
                <small>{t("portalRewardCatalog.imageDropHint")}</small>
              </span>
              <input id="catalog-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={editorBusy} aria-label={t("portalRewardCatalog.uploadImage")} onChange={event => { void onUpload(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {previewBlock}
          </div> : <div role="tabpanel" className="reward-admin-image-media reward-admin-image-media-ai">
            <div className="reward-admin-image-panel">
              <div className="reward-admin-field"><label htmlFor="catalog-image-prompt">{t("portalRewardCatalog.imagePrompt")}</label><textarea id="catalog-image-prompt" value={aiPrompt} disabled={editorBusy} rows={4} onChange={event => setAiPrompt(event.target.value)} /></div>
              <Button type="button" variant="outline" className="reward-admin-ai-button" disabled={editorBusy || !name.trim()} aria-busy={imageBusy} onClick={() => void onGenerate()}>
                {imageBusy ? t("portalRewardCatalog.generatingImage") : t("portalRewardCatalog.generateImage")}
              </Button>
            </div>
            {previewBlock}
          </div>}
        </div>
      </section>

      <section className="reward-admin-section">
        <h3 className="reward-admin-section-title">{t("portalRewardCatalog.sectionDescription")}</h3>
        <div className="reward-admin-section-body">
          <div className="reward-admin-field reward-admin-description">
            <label htmlFor="catalog-description">{t("portalRewardCatalog.description")}</label>
            <textarea id="catalog-description" value={description} maxLength={500} onChange={event => { const next = event.target.value; setDescription(next); if (imageTab === "ai") syncAiPrompt(name, next); }} />
            <span className="reward-admin-description-count">{t("portalRewardCatalog.descriptionCount", { count: description.length })}</span>
          </div>
        </div>
      </section>
    </form></SidePanel> : null}
    <SidePanel half open={panel === "redemptions"} title={t("portalRewardCatalog.redemptions")} onClose={() => setPanel(null)} closeLabel={t("portalOps.close")}>
      {actionError ? <p className="reward-admin-error" role="alert">{actionError}</p> : null}
      <div className="reward-admin-records-panel">
        <ListTable loading={loading} loadingLabel={t("portalCatalog.loading")} skeletonColumns={3} onRefresh={() => load().catch(reason => setError(t(failure(reason))))}
          header={<tr><th>{t("portalVoucher.ownerId")}</th><th>{t("portalRewardCatalog.items")}</th><th>{t("orders.columns.actions")}</th></tr>}>
          {redemptions.map(row => <tr key={row.id}><td>{row.account}</td><td>{row.name} · {row.points} · {t(row.status === "fulfilled" ? "portalRewardCatalog.fulfilled" : "portalRewardCatalog.pending")}{row.voucher_status ? ` · ${t(`portalVoucher.${row.voucher_status}`)}` : ""}{row.voucher_last4 ? ` · ${row.voucher_last4}` : ""}</td><td className="table-actions-cell">{canEdit && row.status === "pending" ? <Button type="button" variant="outline" disabled={fulfilling !== null} aria-busy={fulfilling === row.id} onClick={() => { setFulfilling(row.id); setActionError(""); void fulfillRewardRedemption(row.id).then(() => load()).catch(reason => setActionError(t(failure(reason)))).finally(() => setFulfilling(null)); }}>{t("portalRewardCatalog.fulfill")}</Button> : null}</td></tr>)}
          {!redemptions.length ? <tr><td colSpan={3}>{error ? t("portalRewardCatalog.failed") : t("portalRewardCatalog.noRedemptions")}</td></tr> : null}
        </ListTable>
        <TablePagination summary={t("orders.pagination", {from: total ? (page-1)*15+1 : 0, to:Math.min(page*15,total),total})}
          page={page} totalPages={Math.max(1,Math.ceil(total/15))} loading={loading}
          onPrevious={() => setPage(current=>Math.max(1,current-1))} onNext={() => setPage(current=>Math.min(Math.max(1,Math.ceil(total/15)),current+1))}
          onPageChange={setPage} previousLabel={t("orders.previous")} nextLabel={t("orders.next")} pageLabel={t("orders.pageOf")} jumpLabel={t("orders.jumpToPage")} />
      </div>
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
    <section className="panel reward-admin-catalog-table">
      <h2>{t("portalRewardCatalog.items")}</h2>
      {loading && !items.length ? <PageSkeleton label={t("portalCatalog.loading")} variant="profile" compact /> : null}
      <ListTable loading={loading && !items.length} loadingLabel={t("portalCatalog.loading")} skeletonColumns={6} onRefresh={() => load().catch(reason => setError(t(failure(reason))))}
        header={<tr><th>{t("portalRewardCatalog.image")}</th><th>{t("portalRewardCatalog.name")}</th><th>{t("portalRewardCatalog.kind")}</th><th>{t("portalRewardCatalog.points")}</th><th>{t("portalRewardCatalog.stock")}</th><th>{t("portalRewardCatalog.active")}</th><th>{t("orders.columns.actions")}</th></tr>}>
        {items.map(item => <tr key={item.id}>
          <td>{previews[item.id] ? <button type="button" className="reward-admin-table-thumb-button" aria-label={t("portalRewardCatalog.previewImage", { name: item.name })} onClick={() => setLightbox({ url: previews[item.id], name: item.name })}><img className="reward-admin-table-thumb" src={previews[item.id]} alt="" /></button> : <span className="reward-admin-table-thumb is-empty" aria-hidden="true" />}</td>
          <td><div className="reward-admin-table-name">{item.name}{item.description ? <small>{item.description}</small> : null}{item.voucher_amount_hkd ? <small>HK$ {Number(item.voucher_amount_hkd).toFixed(2)}</small> : null}</div></td>
          <td>{t(item.kind === "gift" ? "portalRewardCatalog.gift" : "portalRewardCatalog.voucher")}</td>
          <td>{item.points_cost}</td>
          <td>{item.stock}</td>
          <td>{t(item.is_active ? "portalRewardCatalog.active" : "portalRewardCatalog.inactive")}</td>
          <td className="table-actions-cell">{canEdit ? <Button variant="outline" disabled={saving} onClick={() => openEdit(item)}>{t("portalRewardCatalog.edit")}</Button> : null}</td>
        </tr>)}
        {!items.length ? <tr><td colSpan={7}>{error ? t("portalRewardCatalog.failed") : t("portalRewardCatalog.empty")}</td></tr> : null}
      </ListTable>
    </section>
    <Modal open={Boolean(lightbox)} title={lightbox?.name ?? ""} closeLabel={t("portalOps.close")} size="lg" className="reward-admin-image-lightbox" onClose={() => setLightbox(null)}>
      {lightbox ? <img src={lightbox.url} alt={lightbox.name} /> : null}
    </Modal>
  </section>;
}
