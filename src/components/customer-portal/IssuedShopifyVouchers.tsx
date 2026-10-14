import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listPersonalShopifyVouchers, listPortalShopifyVouchers, type ShopifyVoucher } from "@/lib/shopify-customer-bridge";

export function IssuedShopifyVouchers({ scope, refreshKey, organizationId }: { scope: "personal" | "organization"; refreshKey?: number; organizationId?: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopifyVoucher[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = scope === "personal" ? listPersonalShopifyVouchers : () => listPortalShopifyVouchers(organizationId);
    const refresh = () => void load().then(vouchers => { if (active) setRows(vouchers); }).catch(() => { if (active) setRows([]); });
    refresh();
    const timer = window.setTimeout(refresh, 2500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [scope, refreshKey, organizationId]);
  if (!rows?.length) return null;
  return <section>
    <h2>{t("portalVoucher.codes")}</h2>
    {rows.map(row => <div className="portal-row" key={row.id}>
      <div>
        <strong>{row.name}</strong>
        <p>HK${Number(row.amount).toFixed(0)} · {row.shop_domain} · {t(`portalVoucher.${row.status}`)}</p>
        {row.code ? <p><code>{row.code}</code></p> : null}
      </div>
    </div>)}
  </section>;
}
