import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonalPageSkeleton } from "./PersonalPageSkeleton";
import { listRewardCatalog, rewardCatalogImageUrl, type RewardCatalogItem } from "@/lib/customer-reward-catalog";

function catalogError(error: unknown) {
  const text = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (text.includes("insufficient_points")) return "portalCatalog.insufficient";
  if (text.includes("catalog_unavailable")) return "portalCatalog.unavailable";
  return "portalCatalog.failed";
}

export function RewardCatalogList({ balance, onRedeem, disabled = false }: { disabled?: boolean; balance: number; onRedeem: (item: RewardCatalogItem) => Promise<void> }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RewardCatalogItem[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    void listRewardCatalog()
      .then(async rows => {
        if (!active) return;
        const catalog = rows ?? [];
        setItems(catalog);
        const entries = await Promise.all(catalog.map(async item => {
          if (!item.image_object_path) return null;
          try { return [item.id, await rewardCatalogImageUrl(item.image_object_path)] as const; }
          catch { return null; }
        }));
        if (active) setPreviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
      })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [balance]);
  return <section>
    <h2>{t("portalCatalog.title")}</h2>
    <p>{t("portalCatalog.intro")}</p>
    {error ? <p role="alert">{t(error)}</p> : null}
    {!items ? <PersonalPageSkeleton variant="catalog" label={t("portalCatalog.loading")} /> : items.length ? items.map(item => {
      const affordable = balance >= Number(item.points_cost) && item.stock > 0;
      return <div className="portal-row" key={item.id}>
        <div className="portal-row-media">
          <span className="portal-row-image">
            {previews[item.id] ? <img src={previews[item.id]} alt="" loading="lazy" onError={() => setPreviews(current => { const next = { ...current }; delete next[item.id]; return next; })} /> : <Gift size={40} aria-hidden="true" />}
          </span>
          <div><strong>{item.name}</strong><p>{t(item.kind === "voucher" ? "portalCatalog.voucher" : "portalCatalog.gift")} · {item.points_cost} {t("portalCatalog.points")}{item.voucher_amount_hkd ? ` · HK$${Number(item.voucher_amount_hkd).toFixed(0)}` : ""}{item.stock < 1 ? ` · ${t("portalCatalog.soldOut")}` : ""}</p>{item.description ? <p>{item.description}</p> : null}</div>
        </div>
        <Button type="button" variant="outline" disabled={disabled || !affordable || busy !== ""} onClick={() => {
          if (!window.confirm(t("portalCatalog.confirm", { name: item.name, points: item.points_cost }))) return;
          setBusy(item.id); setError("");
          void onRedeem(item).catch(reason => setError(catalogError(reason))).finally(() => setBusy(""));
        }}>{t("portalCatalog.redeem")}</Button>
      </div>;
    }) : <EmptyState title={t("portalCatalog.empty")} />}
  </section>;
}
