import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, FileText, Layers3, PackageCheck, Plus, ShoppingBag, Store, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { FilterableSelect } from "@/components/ui/filterable-select";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import {
  approveShopifyCatalogDraft,
  fetchShopifyApprovalMaterialOptions,
  fetchShopifyPendingDetail,
  rejectShopifyCatalogDraft,
  resolveShopifyCatalogMatch,
  searchShopifyMatchCandidates,
  type ShopifyDraftPackageItem,
  type ShopifyApprovalMaterialInput,
  type ShopifyApprovalMaterialKind,
  type ShopifyApprovalMaterialOption,
  type ShopifyPendingDetail,
  type ShopifyProductCandidate,
} from "@/lib/shopify-product-approvals";
import { buildShopifyDatabaseComparison, type ShopifyComparisonRow } from "@/lib/shopify-product-comparison";

function comparisonValue(value: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (value === "yes") return t("shopifyCatalog.comparisonValues.yes");
  if (value === "no") return t("shopifyCatalog.comparisonValues.no");
  if (["mapped", "sku_matched", "unmatched", "missing_sku", "duplicate_sku"].includes(value)) {
    return t(`shopifyCatalog.matches.${value}`, { defaultValue: value });
  }
  return value;
}

function DatabaseComparison({ detail }: { detail: ShopifyPendingDetail }) {
  const { t } = useTranslation();
  const rows = useMemo(() => buildShopifyDatabaseComparison(detail), [detail]);
  const changed = rows.filter((row) => row.status === "changed").length;
  const added = rows.filter((row) => row.status === "new").length;
  const same = rows.filter((row) => row.status === "same").length;
  const ordered = useMemo(() => [...rows].sort((left, right) => {
    const rank: Record<ShopifyComparisonRow["status"], number> = { changed: 0, new: 1, same: 2 };
    return rank[left.status] - rank[right.status];
  }), [rows]);
  return (
    <article className="panel shopify-comparison-panel">
      <header className="shopify-comparison-heading">
        <div><h2>{t("shopifyCatalog.databaseComparison")}</h2><p>{t("shopifyCatalog.databaseComparisonDescription")}</p></div>
        <div className="shopify-comparison-summary"><span className="is-changed">{t("shopifyCatalog.comparisonSummary.changed", { count: changed })}</span><span className="is-new">{t("shopifyCatalog.comparisonSummary.new", { count: added })}</span><span className="is-same">{t("shopifyCatalog.comparisonSummary.same", { count: same })}</span></div>
      </header>
      <ListTable
        className="shopify-comparison-table-wrap"
        tableClassName="shopify-comparison-table"
        loading={false}
        loadingLabel=""
        skeletonColumns={5}
        header={<tr><th>{t("shopifyCatalog.comparisonSection")}</th><th>{t("shopifyCatalog.comparisonField")}</th><th>{t("shopifyCatalog.currentDatabase")}</th><th>{t("shopifyCatalog.incomingShopify")}</th><th>{t("shopifyCatalog.difference")}</th></tr>}
      >
        {ordered.map((comparison) => <tr key={comparison.id} className={`shopify-comparison-${comparison.status}`}><td><strong>{comparison.section}</strong></td><td>{t(`shopifyCatalog.comparisonFields.${comparison.field}`)}</td><td>{comparisonValue(comparison.currentValue, t)}</td><td>{comparisonValue(comparison.shopifyValue, t)}</td><td><span className={`status-badge shopify-comparison-badge-${comparison.status}`}>{t(`shopifyCatalog.comparisonStatuses.${comparison.status}`)}</span></td></tr>)}
      </ListTable>
    </article>
  );
}

function PackageItemsTable({ items, canResolve, onResolve }: { items: ShopifyDraftPackageItem[]; canResolve: boolean; onResolve: (itemId: string) => void }) {
  const { t, i18n } = useTranslation();
  const money = useMemo(() => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD" }), [i18n.language]);
  return <ListTable className="shopify-package-table-wrap" tableClassName="shopify-package-table" loading={false} loadingLabel="" skeletonColumns={5} header={<tr><th>{t("shopifyCatalog.item")}</th><th>SKU</th><th>{t("shopifyCatalog.quantity")}</th><th>{t("shopifyCatalog.addonPrice")}</th><th>{t("shopifyCatalog.match")}</th></tr>}><>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td><span className="shopify-package-item-sku">{item.sku ?? "—"}</span></td><td>{item.quantity}</td><td>{money.format(item.addonPrice)}</td><td><div className="shopify-package-item-match"><span className={`status-badge shopify-match-${item.matchStatus}`}>{t(`shopifyCatalog.matches.${item.matchStatus}`, { defaultValue: item.matchStatus })}</span>{canResolve && !item.matchedProductId ? <Button size="sm" variant="outline" onClick={() => onResolve(item.id)}>{t("shopifyCatalog.linkSelected")}</Button> : null}</div></td></tr>)}</></ListTable>;
}

function PackageItemsPanel({ title, summary, items, canResolve, onResolve }: { title: string; summary: string; items: ShopifyDraftPackageItem[]; canResolve: boolean; onResolve: (itemId: string) => void }) {
  const { t } = useTranslation();
  return <article className="panel shopify-package-panel"><header className="shopify-section-card-header"><span className="shopify-detail-card-icon is-package"><PackageCheck /></span><div><h2>{title}</h2><small>{summary}</small></div><span className="shopify-package-item-count">{t("shopifyCatalog.packageItemSummary", { count: items.length })}</span></header><PackageItemsTable items={items} canResolve={canResolve} onResolve={onResolve} /></article>;
}

type SelectedApprovalMaterial = ShopifyApprovalMaterialInput & ShopifyApprovalMaterialOption;

function MaterialMappingCard({
  kind,
  options,
  selected,
  disabled,
  onAdd,
  onRemove,
}: {
  kind: ShopifyApprovalMaterialKind;
  options: ShopifyApprovalMaterialOption[];
  selected: SelectedApprovalMaterial[];
  disabled: boolean;
  onAdd: (item: SelectedApprovalMaterial) => void;
  onRemove: (ingredientId: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const available = options.filter((option) => !selected.some((item) => item.ingredientId === option.id));
  const add = () => {
    const option = options.find((item) => item.id === selectedId);
    const parsedQuantity = Number.parseFloat(quantity);
    if (!option || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    onAdd({ ...option, ingredientId: option.id, kind, quantity: parsedQuantity });
    setSelectedId("");
    setQuantity("1");
  };
  return (
    <section className="shopify-material-card" aria-label={t(`shopifyCatalog.materials.${kind}`)}>
      <header><h3>{t(`shopifyCatalog.materials.${kind}`)}</h3><span>{selected.length}</span></header>
      <div className="shopify-material-add-row">
        <FilterableSelect value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={disabled} aria-label={t(`shopifyCatalog.materials.select.${kind}`)}>
          <option value="">{t(`shopifyCatalog.materials.select.${kind}`)}</option>
          {available.map((option) => <option key={option.id} value={option.id}>{option.sku ? `${option.sku} · ` : ""}{option.name}</option>)}
        </FilterableSelect>
        <label><span>{t("shopifyCatalog.quantity")}</span><input type="number" min="0.001" step="0.001" value={quantity} disabled={disabled} onChange={(event) => setQuantity(event.target.value)} /></label>
        <Button type="button" variant="outline" disabled={disabled || !selectedId} onClick={add}><Plus />{t("shopifyCatalog.materials.add")}</Button>
      </div>
      {selected.length ? <ul className="shopify-material-list">{selected.map((item) => <li key={item.ingredientId}><span><strong>{item.name}</strong>{item.sku ? <small>{item.sku}</small> : null}</span><b>× {item.quantity}</b><Button type="button" variant="outline" size="icon" disabled={disabled} aria-label={t("shopifyCatalog.materials.remove", { item: item.name })} onClick={() => onRemove(item.ingredientId)}><Trash2 /></Button></li>)}</ul> : <p>{t(`shopifyCatalog.materials.empty.${kind}`)}</p>}
    </section>
  );
}

export function ShopifyPendingProductDetailPage({ canManage = false }: { canManage?: boolean }) {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<ShopifyPendingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<ShopifyProductCandidate[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [resolving, setResolving] = useState(false);
  const [materialOptions, setMaterialOptions] = useState<Record<ShopifyApprovalMaterialKind, ShopifyApprovalMaterialOption[]>>({ ingredient: [], packing: [] });
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedApprovalMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }), [i18n.language]);
  const money = useMemo(() => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD" }), [i18n.language]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchShopifyPendingDetail(id).then((value) => active && setDetail(value)).catch(() => active && setError(t("shopifyCatalog.loadError"))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, t]);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    setMaterialsLoading(true);
    void Promise.all([
      fetchShopifyApprovalMaterialOptions("ingredient"),
      fetchShopifyApprovalMaterialOptions("packing"),
    ]).then(([ingredient, packing]) => {
      if (active) setMaterialOptions({ ingredient, packing });
    }).catch(() => {
      if (active) setError(t("shopifyCatalog.materials.loadError"));
    }).finally(() => {
      if (active) setMaterialsLoading(false);
    });
    return () => { active = false; };
  }, [canManage, t]);

  const approve = async () => {
    if (!detail) return;
    setApproving(true);
    setError(null);
    try {
      await approveShopifyCatalogDraft(detail.id, detail.updatedAt, note, selectedMaterials);
      setApproved(true);
      setDetail({ ...detail, status: "approved" });
    } catch {
      setError(t("shopifyCatalog.approveError"));
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    if (!detail) return;
    setApproving(true);
    setError(null);
    try {
      await rejectShopifyCatalogDraft(detail.id, detail.updatedAt, note);
      setDetail({ ...detail, status: "rejected" });
    } catch {
      setError(t("shopifyCatalog.rejectError"));
    } finally {
      setApproving(false);
    }
  };

  const searchCandidates = async () => {
    setError(null);
    try {
      const rows = await searchShopifyMatchCandidates(candidateQuery);
      setCandidates(rows);
      setSelectedProductId(rows[0]?.id ?? "");
    } catch {
      setError(t("shopifyCatalog.matchSearchError"));
    }
  };

  const resolveMatch = async (target: { variantRowId?: string; packageItemRowId?: string }) => {
    if (!detail || !selectedProductId) {
      setError(t("shopifyCatalog.selectMatch"));
      return;
    }
    setResolving(true);
    setError(null);
    try {
      await resolveShopifyCatalogMatch({
        draftId: detail.id,
        productId: selectedProductId,
        expectedUpdatedAt: detail.updatedAt,
        ...target,
      });
      setDetail(await fetchShopifyPendingDetail(detail.id));
    } catch {
      setError(t("shopifyCatalog.resolveError"));
    } finally {
      setResolving(false);
    }
  };

  if (loading) return <section className="shopify-catalog-page"><div className="panel products-state">{t("shopifyCatalog.loading")}</div></section>;
  if (!detail) return <section className="shopify-catalog-page"><div className="panel products-state products-state-error">{error ?? t("shopifyCatalog.notFound")}</div></section>;
  const blocked = detail.blockingReasons.length > 0 || ["conflict", "dependency_pending", "approved", "rejected", "ignored", "deleted"].includes(detail.status);
  const shopHandle = detail.storeDomain.replace(/\.myshopify\.com$/, "");
  const shopUrl = `https://admin.shopify.com/store/${shopHandle}/products/${detail.shopifyProductId}`;
  return (
    <section className="shopify-catalog-page">
      <header className="page-heading">
        <div><Link className="back-link" to="/products/shopify-pending"><ArrowLeft />{t("shopifyCatalog.back")}</Link><span className="eyebrow">{detail.storeDomain}</span><div className="shopify-detail-title-row"><h1>{detail.title}</h1><a className="shopify-product-admin-link" href={shopUrl} target="_blank" rel="noreferrer" aria-label={t("shopifyCatalog.openShopify")} title={t("shopifyCatalog.openShopify")}><ShoppingBag aria-hidden="true" /><strong aria-hidden="true">S</strong></a></div><p>{t(`shopifyCatalog.types.${detail.catalogType}`)} · #{detail.shopifyProductId}</p></div>
      </header>
      {error ? <div className="products-state products-state-error" role="alert"><AlertTriangle />{error}</div> : null}
      {approved ? <div className="shopify-success" role="status"><CheckCircle2 />{t("shopifyCatalog.approved")}</div> : null}
      <DatabaseComparison detail={detail} />
      {canManage ? <article className="panel shopify-material-mapping-panel"><header><div><h2>{t("shopifyCatalog.materials.title")}</h2><p>{t("shopifyCatalog.materials.description")}</p></div></header><div className="shopify-material-grid">{(["ingredient", "packing"] as const).map((kind) => <MaterialMappingCard key={kind} kind={kind} options={materialOptions[kind]} selected={selectedMaterials.filter((item) => item.kind === kind)} disabled={materialsLoading || approving || blocked} onAdd={(item) => setSelectedMaterials((current) => [...current, item])} onRemove={(ingredientId) => setSelectedMaterials((current) => current.filter((item) => item.ingredientId !== ingredientId))} />)}</div></article> : null}
      <div className="shopify-detail-grid">
        <article className="panel shopify-source-panel">
          <header className="shopify-detail-card-header">
            <span className="shopify-detail-card-icon"><Store /></span>
            <div><h2>{t("shopifyCatalog.sourceData")}</h2><small>{detail.storeDomain}</small></div>
            <span className={`status-badge shopify-status-${detail.status}`}>{t(`shopifyCatalog.statuses.${detail.status}`)}</span>
          </header>
          <dl className="shopify-detail-list">
            <div><dt>{t("shopifyCatalog.shopifyStatus")}</dt><dd>{detail.shopifyStatus ?? "—"}</dd></div>
            <div><dt>{t("shopifyCatalog.productType")}</dt><dd>{detail.productType ?? "—"}</dd></div>
            <div className="shopify-detail-list-wide"><dt>{t("shopifyCatalog.vendor")}</dt><dd>{detail.vendor ?? "—"}</dd></div>
            <div className="shopify-detail-list-wide"><dt>{t("shopifyCatalog.updatedAt")}</dt><dd>{date.format(new Date(detail.sourceUpdatedAt ?? detail.updatedAt))}</dd></div>
          </dl>
          {detail.descriptionHtml ? <div className="shopify-source-description"><FileText /><p>{detail.descriptionHtml.replace(/<[^>]*>/g, " ").trim()}</p></div> : null}
        </article>
        <article className="panel shopify-review-panel">
          <header className="shopify-detail-card-header">
            <span className="shopify-detail-card-icon is-review"><ClipboardCheck /></span>
            <div><h2>{t("shopifyCatalog.review")}</h2><small>{t(`shopifyCatalog.types.${detail.catalogType}`)}</small></div>
          </header>
          {detail.blockingReasons.length ? <div className="shopify-blockers"><AlertTriangle /><div><strong>{t("shopifyCatalog.cannotApprove")}</strong><ul>{detail.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div></div> : <div className="shopify-review-readiness"><CheckCircle2 /><span>{t("shopifyCatalog.readyToApprove")}</span></div>}
          <label className="shopify-review-note"><span>{t("shopifyCatalog.reviewNote")}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} /></label>
          {canManage ? <div className="shopify-review-actions"><Button onClick={() => void approve()} disabled={blocked || approving}>{approving ? t("shopifyCatalog.approving") : t("shopifyCatalog.approve")}</Button><Button variant="outline" onClick={() => void reject()} disabled={approving || ["approved", "rejected", "deleted"].includes(detail.status)}>{t("shopifyCatalog.reject")}</Button></div> : <p>{t("shopifyCatalog.readOnly")}</p>}
        </article>
      </div>
      {canManage && detail.blockingReasons.length ? <article className="panel shopify-match-workbench"><div><h2>{t("shopifyCatalog.resolveMatches")}</h2><p>{t("shopifyCatalog.resolveMatchesDescription")}</p></div><div className="shopify-match-search"><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder={t("shopifyCatalog.matchSearchPlaceholder")} /><Button variant="outline" onClick={() => void searchCandidates()}>{t("shopifyCatalog.searchAction")}</Button><FilterableSelect value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">{t("shopifyCatalog.selectProduct")}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.sku ? `${candidate.sku} · ` : ""}{candidate.name}</option>)}</FilterableSelect></div></article> : null}
      {Object.keys(detail.changeDiff).length ? <article className="panel"><h2>{t("shopifyCatalog.changes")}</h2><div className="shopify-diff-list">{Object.entries(detail.changeDiff).map(([field, change]) => <div key={field}><strong>{field}</strong><pre>{JSON.stringify(change.before, null, 2)}</pre><span>→</span><pre>{JSON.stringify(change.after, null, 2)}</pre></div>)}</div></article> : null}
      <article className="panel shopify-variants-panel">
        <header className="shopify-section-card-header">
          <span className="shopify-detail-card-icon is-variant"><Layers3 /></span>
          <div><h2>{t("shopifyCatalog.variants")}</h2><small>{t("shopifyCatalog.variantSummary", { count: detail.variants.length })}</small></div>
        </header>
        <ListTable className="shopify-variants-table-wrap" tableClassName="shopify-variants-table" loading={false} loadingLabel="" skeletonColumns={4} header={<tr><th>{t("shopifyCatalog.variant")}</th><th>SKU</th><th>{t("shopifyCatalog.price")}</th><th>{t("shopifyCatalog.match")}</th></tr>}>
          <>{detail.variants.map((variant) => <tr key={variant.id}><td><strong>{variant.title ?? `#${variant.shopifyVariantId}`}</strong></td><td><span className="shopify-variant-sku" title={variant.sku ?? undefined}>{variant.sku ?? "—"}</span></td><td>{variant.price === null ? "—" : money.format(variant.price)}</td><td><div className="shopify-variant-match"><span className={`status-badge shopify-match-${variant.matchStatus}`}>{t(`shopifyCatalog.matches.${variant.matchStatus}`, { defaultValue: variant.matchStatus })}</span>{canManage && ["missing_sku", "duplicate_sku"].includes(variant.matchStatus) ? <Button size="sm" variant="outline" disabled={resolving} onClick={() => void resolveMatch({ variantRowId: variant.id })}>{t("shopifyCatalog.linkSelected")}</Button> : null}</div></td></tr>)}</>
        </ListTable>
      </article>
      {detail.fixedItems.length ? <PackageItemsPanel title={t("shopifyCatalog.fixedItems")} summary={t("shopifyCatalog.packageItemSummary", { count: detail.fixedItems.length })} items={detail.fixedItems} canResolve={canManage && Boolean(selectedProductId) && !resolving} onResolve={(itemId) => void resolveMatch({ packageItemRowId: itemId })} /> : null}
      {detail.choiceSets.map((choice) => <PackageItemsPanel key={choice.id} title={choice.name} summary={t("shopifyCatalog.choiceRule", { min: choice.minimumChoices ?? 0, max: choice.maximumChoices })} items={choice.items} canResolve={canManage && Boolean(selectedProductId) && !resolving} onResolve={(itemId) => void resolveMatch({ packageItemRowId: itemId })} />)}
    </section>
  );
}
