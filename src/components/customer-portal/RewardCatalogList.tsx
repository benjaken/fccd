import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { listRewardCatalog, type RewardCatalogItem } from "@/lib/customer-reward-catalog";

function catalogError(error: unknown) {
  const text = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (text.includes("insufficient_points")) return "portalCatalog.insufficient";
  if (text.includes("catalog_unavailable")) return "portalCatalog.unavailable";
  return "portalCatalog.failed";
}

export function RewardCatalogList({ balance, onRedeem }: { balance: number; onRedeem: (item: RewardCatalogItem) => Promise<void> }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RewardCatalogItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { let active = true; void listRewardCatalog().then(rows => { if (active) setItems(rows ?? []); }).catch(() => { if (active) setItems([]); }); return () => { active = false; }; }, [balance]);
  if (!items) return <p role="status">{t("portalCatalog.loading")}</p>;
  return <section>
    <h2>{t("portalCatalog.title")}</h2>
    <p>{t("portalCatalog.intro")}</p>
    {error ? <p role="alert">{t(error)}</p> : null}
    {items.length ? items.map(item => {
      const affordable = balance >= Number(item.points_cost) && item.stock > 0;
      return <div className="portal-row" key={item.id}>
        <div><strong>{item.name}</strong><p>{t(item.kind === "voucher" ? "portalCatalog.voucher" : "portalCatalog.gift")} · {item.points_cost} {t("portalCatalog.points")}{item.voucher_amount_hkd ? ` · HK$${Number(item.voucher_amount_hkd).toFixed(0)}` : ""}{item.stock < 1 ? ` · ${t("portalCatalog.soldOut")}` : ""}</p>{item.description ? <p>{item.description}</p> : null}</div>
        <Button type="button" variant="outline" disabled={!affordable || busy === item.id} onClick={() => {
          if (!window.confirm(t("portalCatalog.confirm", { name: item.name, points: item.points_cost }))) return;
          setBusy(item.id); setError("");
          void onRedeem(item).catch(reason => setError(catalogError(reason))).finally(() => setBusy(""));
        }}>{t("portalCatalog.redeem")}</Button>
      </div>;
    }) : <p>{t("portalCatalog.empty")}</p>}
  </section>;
}
