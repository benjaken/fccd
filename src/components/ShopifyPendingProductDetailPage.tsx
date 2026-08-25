import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, PackageCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import {
  approveShopifyCatalogDraft,
  fetchShopifyPendingDetail,
  rejectShopifyCatalogDraft,
  resolveShopifyCatalogMatch,
  searchShopifyMatchCandidates,
  type ShopifyDraftPackageItem,
  type ShopifyPendingDetail,
  type ShopifyProductCandidate,
} from "@/lib/shopify-product-approvals";

function PackageItemsTable({ items, canResolve, onResolve }: { items: ShopifyDraftPackageItem[]; canResolve: boolean; onResolve: (itemId: string) => void }) {
  const { t, i18n } = useTranslation();
  const money = useMemo(() => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "HKD" }), [i18n.language]);
  return <ListTable loading={false} loadingLabel="" skeletonColumns={5} header={<tr><th>{t("shopifyCatalog.item")}</th><th>SKU</th><th>{t("shopifyCatalog.quantity")}</th><th>{t("shopifyCatalog.addonPrice")}</th><th>{t("shopifyCatalog.match")}</th></tr>}><>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.sku ?? "—"}</td><td>{item.quantity}</td><td>{money.format(item.addonPrice)}</td><td><span className={`status-badge shopify-match-${item.matchStatus}`}>{t(`shopifyCatalog.matches.${item.matchStatus}`, { defaultValue: item.matchStatus })}</span>{canResolve && !item.matchedProductId ? <Button size="sm" variant="outline" onClick={() => onResolve(item.id)}>{t("shopifyCatalog.linkSelected")}</Button> : null}</td></tr>)}</></ListTable>;
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
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }), [i18n.language]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchShopifyPendingDetail(id).then((value) => active && setDetail(value)).catch(() => active && setError(t("shopifyCatalog.loadError"))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, t]);

  const approve = async () => {
    if (!detail) return;
    setApproving(true);
    setError(null);
    try {
      await approveShopifyCatalogDraft(detail.id, detail.updatedAt, note);
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
  const blocked = detail.blockingReasons.length > 0 || ["conflict", "dependency_pending", "approved", "rejected", "deleted"].includes(detail.status);
  const shopHandle = detail.storeDomain.replace(/\.myshopify\.com$/, "");
  const shopUrl = `https://admin.shopify.com/store/${shopHandle}/products/${detail.shopifyProductId}`;
  return (
    <section className="shopify-catalog-page">
      <header className="page-heading">
        <div><Link className="back-link" to="/products/shopify-pending"><ArrowLeft />{t("shopifyCatalog.back")}</Link><span className="eyebrow">{detail.storeDomain}</span><h1>{detail.title}</h1><p>{t(`shopifyCatalog.types.${detail.catalogType}`)} · #{detail.shopifyProductId}</p></div>
        <a className="button button-outline" href={shopUrl} target="_blank" rel="noreferrer">{t("shopifyCatalog.openShopify")}<ExternalLink /></a>
      </header>
      {error ? <div className="products-state products-state-error" role="alert"><AlertTriangle />{error}</div> : null}
      {approved ? <div className="shopify-success" role="status"><CheckCircle2 />{t("shopifyCatalog.approved")}</div> : null}
      <div className="shopify-detail-grid">
        <article className="panel"><h2>{t("shopifyCatalog.sourceData")}</h2><dl className="shopify-detail-list"><div><dt>{t("shopifyCatalog.status")}</dt><dd>{t(`shopifyCatalog.statuses.${detail.status}`)}</dd></div><div><dt>{t("shopifyCatalog.shopifyStatus")}</dt><dd>{detail.shopifyStatus ?? "—"}</dd></div><div><dt>{t("shopifyCatalog.vendor")}</dt><dd>{detail.vendor ?? "—"}</dd></div><div><dt>{t("shopifyCatalog.productType")}</dt><dd>{detail.productType ?? "—"}</dd></div><div><dt>{t("shopifyCatalog.updatedAt")}</dt><dd>{date.format(new Date(detail.sourceUpdatedAt ?? detail.updatedAt))}</dd></div></dl>{detail.descriptionHtml ? <pre className="shopify-description">{detail.descriptionHtml.replace(/<[^>]*>/g, " ")}</pre> : null}</article>
        <article className="panel"><h2>{t("shopifyCatalog.review")}</h2>{detail.blockingReasons.length ? <div className="shopify-blockers"><AlertTriangle /><div><strong>{t("shopifyCatalog.cannotApprove")}</strong><ul>{detail.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div></div> : <p>{t("shopifyCatalog.readyToApprove")}</p>}<label className="shopify-review-note"><span>{t("shopifyCatalog.reviewNote")}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} /></label>{canManage ? <div className="shopify-review-actions"><Button onClick={() => void approve()} disabled={blocked || approving}>{approving ? t("shopifyCatalog.approving") : t("shopifyCatalog.approve")}</Button><Button variant="outline" onClick={() => void reject()} disabled={approving || ["approved", "rejected", "deleted"].includes(detail.status)}>{t("shopifyCatalog.reject")}</Button></div> : <p>{t("shopifyCatalog.readOnly")}</p>}</article>
      </div>
      {canManage && detail.blockingReasons.length ? <article className="panel shopify-match-workbench"><div><h2>{t("shopifyCatalog.resolveMatches")}</h2><p>{t("shopifyCatalog.resolveMatchesDescription")}</p></div><div className="shopify-match-search"><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder={t("shopifyCatalog.matchSearchPlaceholder")} /><Button variant="outline" onClick={() => void searchCandidates()}>{t("shopifyCatalog.searchAction")}</Button><select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">{t("shopifyCatalog.selectProduct")}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.sku ? `${candidate.sku} · ` : ""}{candidate.name}</option>)}</select></div></article> : null}
      {Object.keys(detail.changeDiff).length ? <article className="panel"><h2>{t("shopifyCatalog.changes")}</h2><div className="shopify-diff-list">{Object.entries(detail.changeDiff).map(([field, change]) => <div key={field}><strong>{field}</strong><pre>{JSON.stringify(change.before, null, 2)}</pre><span>→</span><pre>{JSON.stringify(change.after, null, 2)}</pre></div>)}</div></article> : null}
      <article className="panel"><h2>{t("shopifyCatalog.variants")}</h2><ListTable loading={false} loadingLabel="" skeletonColumns={4} header={<tr><th>{t("shopifyCatalog.variant")}</th><th>SKU</th><th>{t("shopifyCatalog.price")}</th><th>{t("shopifyCatalog.match")}</th></tr>}><>{detail.variants.map((variant) => <tr key={variant.id}><td>{variant.title ?? `#${variant.shopifyVariantId}`}</td><td>{variant.sku ?? "—"}</td><td>{variant.price ?? "—"}</td><td>{t(`shopifyCatalog.matches.${variant.matchStatus}`, { defaultValue: variant.matchStatus })}{canManage && ["missing_sku", "duplicate_sku"].includes(variant.matchStatus) ? <Button size="sm" variant="outline" disabled={resolving} onClick={() => void resolveMatch({ variantRowId: variant.id })}>{t("shopifyCatalog.linkSelected")}</Button> : null}</td></tr>)}</></ListTable></article>
      {detail.fixedItems.length ? <article className="panel"><h2><PackageCheck />{t("shopifyCatalog.fixedItems")}</h2><PackageItemsTable items={detail.fixedItems} canResolve={canManage && Boolean(selectedProductId) && !resolving} onResolve={(itemId) => void resolveMatch({ packageItemRowId: itemId })} /></article> : null}
      {detail.choiceSets.map((choice) => <article className="panel" key={choice.id}><h2>{choice.name}</h2><p>{t("shopifyCatalog.choiceRule", { min: choice.minimumChoices ?? 0, max: choice.maximumChoices })}</p><PackageItemsTable items={choice.items} canResolve={canManage && Boolean(selectedProductId) && !resolving} onResolve={(itemId) => void resolveMatch({ packageItemRowId: itemId })} /></article>)}
    </section>
  );
}
