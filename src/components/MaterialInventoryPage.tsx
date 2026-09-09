import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Eye, PackageOpen, RefreshCw, Save } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { Modal } from "@/components/ui/modal";
import { SidePanel } from "@/components/ui/side-panel";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  correctMaterialCurrentStock,
  fetchMaterialInventory,
  fetchMaterialInventoryLedger,
  type MaterialInventoryItem,
  type MaterialInventoryKind,
  type MaterialInventoryLedgerEntry,
} from "@/lib/material-inventory";
import styles from "./MaterialInventoryPage.module.css";

const SUMMARY_COLUMNS = [
  { width: "8rem" }, { width: "8rem" }, { width: "18rem" },
  { width: "8rem" }, { width: "8rem" }, { width: "8rem" },
  { width: "11rem" }, { width: "6rem" },
];
const PAGE_SIZE = 15;

function quantity(value: number | null, unit: string | null) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 3 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function dateTime(value: string | null, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

export function MaterialInventoryPage() {
  const { t, i18n } = useTranslation();
  const access = useCurrentPageAccess();
  const [kind, setKind] = useState<MaterialInventoryKind>("ingredient");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [items, setItems] = useState<MaterialInventoryItem[]>([]);
  const [selected, setSelected] = useState<MaterialInventoryItem | null>(null);
  const [ledger, setLedger] = useState<MaterialInventoryLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [correctionQuantity, setCorrectionQuantity] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const canCorrect = access.canManage("kitchen.inventory")
    || access.canAccess(kind === "ingredient" ? "kitchen.ingredient_stocktakes.edit" : "kitchen.packing_stocktakes.edit");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void fetchMaterialInventory(kind, appliedSearch)
      .then((rows) => { if (active) { setItems(rows); setPage(1); } })
      .catch(() => { if (active) setError("load"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appliedSearch, kind, reloadKey]);

  useEffect(() => {
    if (!selected) { setLedger([]); return; }
    let active = true;
    setLedgerLoading(true);
    void fetchMaterialInventoryLedger(kind, selected.ingredientId)
      .then((rows) => { if (active) { setLedger(rows); setLedgerPage(1); } })
      .catch(() => { if (active) setError("ledger"); })
      .finally(() => { if (active) setLedgerLoading(false); });
    return () => { active = false; };
  }, [kind, selected, reloadKey]);

  const changeKind = (next: MaterialInventoryKind) => {
    setKind(next); setSelected(null); setSearch(""); setAppliedSearch(""); setPage(1);
  };
  const selectedStatus = useMemo(() => {
    if (!selected || selected.currentQuantity === null) return "missing";
    if (selected.minimumStock !== null && selected.currentQuantity <= selected.minimumStock) return "low";
    return "ok";
  }, [selected]);

  const correctStock = async () => {
    if (!selected || correcting) return;
    const nextQuantity = Number(correctionQuantity);
    if (!correctionQuantity.trim() || !Number.isFinite(nextQuantity) || nextQuantity < 0) {
      setError("quantity"); return;
    }
    if (!correctionReason.trim()) { setError("reason"); return; }
    setCorrecting(true); setError(null);
    try {
      await correctMaterialCurrentStock({ kind, ingredientId: selected.ingredientId, quantity: nextQuantity, reason: correctionReason });
      setSelected({ ...selected, currentQuantity: nextQuantity, lastActivityAt: new Date().toISOString() });
      setCorrectionQuantity(""); setCorrectionReason(""); setCorrectionOpen(false); setReloadKey((value) => value + 1);
    } catch { setError("correction"); }
    finally { setCorrecting(false); }
  };

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visibleItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ledgerTotalPages = Math.max(1, Math.ceil(ledger.length / PAGE_SIZE));
  const visibleLedger = ledger.slice((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE);
  const paginationProps = {
    previousLabel: t("materialInventory.previous"), nextLabel: t("materialInventory.next"),
    pageLabel: t("materialInventory.pageOf"), jumpLabel: t("materialInventory.jumpToPage"),
  };
  const ledgerPagination = !ledgerLoading && ledger.length > 0 ? (
    <div className={styles.paginationFooter}>
      <TablePagination
        summary={t("materialInventory.pagination", { from: (ledgerPage - 1) * PAGE_SIZE + 1, to: Math.min(ledgerPage * PAGE_SIZE, ledger.length), total: ledger.length })}
        page={ledgerPage}
        totalPages={ledgerTotalPages}
        loading={ledgerLoading}
        onPrevious={() => setLedgerPage((value) => Math.max(1, value - 1))}
        onNext={() => setLedgerPage((value) => Math.min(ledgerTotalPages, value + 1))}
        onPageChange={setLedgerPage}
        {...paginationProps}
      />
    </div>
  ) : null;

  return <section className="ingredients-page material-inventory-page">
    <header className="page-heading ingredients-heading"><div><span className="eyebrow">{t("navigation.kitchen")}</span><h1>{t("materialInventory.title")}</h1><p>{t("materialInventory.description")}</p></div></header>
    <article className={`panel ingredients-panel ${styles.inventoryPanel}`}>
      <div className={`${styles.toolbar} border-b border-border p-4`}>
        <SegmentedTabs value={kind} label={t("materialInventory.kindTabs")} onChange={changeKind} tabs={(["ingredient", "packing"] as const).map((tab) => ({ value: tab, label: t(`materialInventory.kinds.${tab}`) }))} />
        <ListSearchBar className={styles.inventorySearch} id="material-inventory-search" value={search} onChange={setSearch} onSubmit={() => setAppliedSearch(search.trim())} label={t("materialInventory.search")} placeholder={t("materialInventory.searchPlaceholder")} submitLabel={t("materialInventory.searchAction")} />
      </div>
      {error === "load" ? <div className="products-state products-state-error"><RefreshCw /><div><strong>{t("materialInventory.loadError")}</strong><span>{t("materialInventory.loadErrorDescription")}</span></div><Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>{t("materialInventory.retry")}</Button></div> : !loading && items.length === 0 ? <div className="products-state products-state-empty"><PackageOpen /><div><strong>{t("materialInventory.empty")}</strong><span>{t("materialInventory.emptyDescription")}</span></div></div> : <ListTable className="ingredients-table-wrap" loading={loading} loadingLabel={t("materialInventory.loading")} skeletonColumns={SUMMARY_COLUMNS} skeletonRows={PAGE_SIZE} onRefresh={() => setReloadKey((value) => value + 1)} header={<tr><th>SKU</th><th>{t("materialInventory.columns.category")}</th><th>{t("materialInventory.columns.item")}</th><th>{t("materialInventory.columns.current")}</th><th>{t("materialInventory.columns.minimum")}</th><th>{t("materialInventory.columns.status")}</th><th>{t("materialInventory.columns.lastActivity")}</th><th><span className="sr-only">{t("materialInventory.view")}</span></th></tr>}>
        {visibleItems.map((item) => {
          const status = item.currentQuantity === null ? "missing" : item.minimumStock !== null && item.currentQuantity <= item.minimumStock ? "low" : "ok";
          return <tr key={item.ingredientId}><td>{item.sku || "—"}</td><td>{item.ingredientType || "—"}</td><td><strong>{item.name}</strong></td><td className="tabular-nums"><strong>{quantity(item.currentQuantity, item.unit)}</strong></td><td className="tabular-nums">{quantity(item.minimumStock, item.unit)}</td><td><span className="inventory-stock-badge" data-tone={status}>{t(`materialInventory.status.${status}`)}</span></td><td>{dateTime(item.lastActivityAt, i18n.language)}</td><td><Button variant="outline" size="sm" onClick={() => { setSelected(item); setError(null); }}><Eye />{t("materialInventory.view")}</Button></td></tr>;
        })}
      </ListTable>}
      {!loading && !error && items.length > 0 ? <TablePagination summary={t("materialInventory.pagination", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, items.length), total: items.length })} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} onPageChange={setPage} {...paginationProps} /> : null}
    </article>
    <SidePanel open={selected !== null} title={selected?.name ?? ""} description={selected ? `${selected.sku || "—"} · ${t(`materialInventory.status.${selectedStatus}`)}` : undefined} closeLabel={t("common.close")} onClose={() => setSelected(null)} footer={ledgerPagination} half className={styles.detailPanel}>
      {error && error !== "load" ? <p className="list-inline-error" role="alert">{t(`materialInventory.errors.${error}`)}</p> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-bold"><ClipboardList />{t("materialInventory.ledgerTitle")}</h3>{selected && canCorrect ? <Button type="button" onClick={() => { setError(null); setCorrectionQuantity(selected.currentQuantity === null ? "" : String(selected.currentQuantity)); setCorrectionOpen(true); }}><Save />{t("materialInventory.correction.open")}</Button> : null}</div>
      <ListTable className={`ingredients-table-wrap ${styles.ledgerTableWrap}`} tableClassName={styles.ledgerTable} loading={ledgerLoading} loadingLabel={t("materialInventory.ledgerLoading")} skeletonColumns={6} skeletonRows={8} header={<tr><th>{t("materialInventory.ledger.time")}</th><th>{t("materialInventory.ledger.type")}</th><th>{t("materialInventory.ledger.quantity")}</th><th>{t("materialInventory.ledger.balance")}</th><th>{t("materialInventory.ledger.reference")}</th><th>{t("materialInventory.ledger.note")}</th></tr>}>
        {visibleLedger.map((entry) => <tr key={entry.id}><td>{dateTime(entry.occurredAt, i18n.language)}</td><td>{t(`materialInventory.movements.${entry.type}`)}</td><td className="tabular-nums">{quantity(entry.quantity, selected?.unit ?? null)}</td><td className="tabular-nums">{quantity(entry.balanceAfter, selected?.unit ?? null)}</td><td className={styles.truncateCell} title={entry.reference || undefined}>{entry.reference || "—"}</td><td className={styles.truncateCell} title={entry.note || undefined}>{entry.note || "—"}</td></tr>)}
      </ListTable>
    </SidePanel>
    <Modal open={correctionOpen && selected !== null} title={t("materialInventory.correction.title")} description={selected ? `${selected.name} · ${selected.sku || "—"}` : undefined} closeLabel={t("common.close")} onClose={() => { if (!correcting) setCorrectionOpen(false); }} size="md" closeOnBackdrop={!correcting} closeOnEscape={!correcting} footer={<><Button type="button" variant="outline" disabled={correcting} onClick={() => setCorrectionOpen(false)}>{t("materialInventory.correction.cancel")}</Button><Button type="button" disabled={correcting} onClick={() => void correctStock()}><Save />{correcting ? t("materialInventory.correction.saving") : t("materialInventory.correction.save")}</Button></>}>
      <p className="mb-4 text-sm text-muted-foreground">{t("materialInventory.correction.description")}</p>
      {error && error !== "load" && error !== "ledger" ? <p className="list-inline-error" role="alert">{t(`materialInventory.errors.${error}`)}</p> : null}
      <div className="grid gap-4"><label className="grid gap-1 text-sm font-medium"><span>{t("materialInventory.correction.quantity")}</span><input className="h-10 rounded-lg border border-border bg-background px-3" type="number" min="0" step="0.001" value={correctionQuantity} onChange={(event) => setCorrectionQuantity(event.target.value)} /></label><label className="grid gap-1 text-sm font-medium"><span>{t("materialInventory.correction.reason")}</span><input className="h-10 rounded-lg border border-border bg-background px-3" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></label></div>
    </Modal>
  </section>;
}
