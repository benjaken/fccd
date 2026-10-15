import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Check, Clock, Copy, Eye, EyeOff, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonalPageSkeleton } from "./PersonalPageSkeleton";
import { listPersonalRewardRedemptions, listPortalRewardRedemptions, type RewardRedemptionRecord } from "@/lib/customer-reward-catalog";
import "@/lib/personal-rewards-i18n";
import "@/lib/customer-portal-i18n";
import "./reward-redemption-records.css";

type VoucherStatus = "queued" | "issuing" | "issued" | "failed";
type IconComponent = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

const VOUCHER_ICON: Record<VoucherStatus, IconComponent> = { queued: Clock, issuing: Send, issued: Check, failed: TriangleAlert };

function formatAmount(amount: number) {
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
}

function RedemptionCode({ code }: { code: string }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    void navigator.clipboard?.writeText(code).catch(() => undefined);
  };
  return <div className="redemption-code">
    <p className="redemption-code-label">{t("portalVoucher.yourCode")}</p>
    <div className="redemption-code-row">
      <div className="redemption-code-field">
        <span className="redemption-code-value" data-revealed={shown}>{shown ? code : "•".repeat(code.length)}</span>
        <Button type="button" variant="ghost" size="icon" className="redemption-code-reveal" aria-pressed={shown} aria-label={t(shown ? "portalVoucher.hideCode" : "portalVoucher.showCode")} onClick={() => setShown(value => !value)}>
          {shown ? <Eye size={22} /> : <EyeOff size={22} />}
        </Button>
      </div>
      <Button type="button" variant="ghost" size="icon" className={`redemption-code-copy${copied ? " is-copied" : ""}`} aria-label={t(copied ? "portalVoucher.copied" : "portalVoucher.copy")} aria-live="polite" onClick={copy}>
        {copied ? <Check size={22} aria-hidden /> : <Copy size={22} aria-hidden />}
      </Button>
    </div>
  </div>;
}

function RedemptionCard({ record }: { record: RewardRedemptionRecord }) {
  const { t, i18n } = useTranslation();
  const voucher = record.kind === "voucher";
  const voucherStatus = voucher ? record.voucher_status : null;
  const Icon: IconComponent = voucherStatus ? VOUCHER_ICON[voucherStatus] ?? Clock : record.status === "fulfilled" ? Check : Clock;
  const tone = voucherStatus ?? record.status;
  const statusLabel = voucherStatus ? t(`portalVoucher.${voucherStatus}`) : t(record.status === "fulfilled" ? "personalRewards.recordFulfilled" : "personalRewards.recordPending");
  const code = voucher && voucherStatus ? record.voucher_code : null;
  const details = voucher && record.voucher_amount != null
    ? `HK$${formatAmount(Number(record.voucher_amount))}${record.shop_domain ? ` · ${record.shop_domain}` : ""}`
    : `${record.points} ${t("portalCatalog.points")}`;
  return <article className={`redemption-card is-${tone}`}>
    <div className="redemption-head">
      <h3 className="redemption-title">{t(voucher ? "portalCatalog.voucher" : "portalCatalog.gift")}</h3>
      <span className="redemption-status"><Icon size={17} aria-hidden />{statusLabel}</span>
    </div>
    <div className="redemption-info">
      <strong>{record.name}</strong>
      <p>{details}</p>
      <time dateTime={record.created_at}>{new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(record.created_at))}</time>
    </div>
    {code ? <RedemptionCode code={code} /> : null}
    {!code && voucherStatus ? <p className="redemption-pending">{t("portalVoucher.codeHint")}</p> : null}
  </article>;
}

export function RewardRedemptionRecords({ scope, refreshKey, organizationId }: { scope: "personal" | "organization"; refreshKey?: number; organizationId?: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RewardRedemptionRecord[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = scope === "personal" ? listPersonalRewardRedemptions : () => listPortalRewardRedemptions(organizationId);
    const refresh = () => void load().then(records => { if (active) setRows(records); }).catch(() => { if (active) setRows([]); });
    refresh();
    const timer = window.setTimeout(refresh, 2500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [scope, refreshKey, organizationId]);
  if (rows === null) return <PersonalPageSkeleton variant="vouchers" label={t("personalRewards.redemptions")} />;
  if (!rows?.length) return <EmptyState title={t("personalRewards.noRedemptions")} />;
  return <section className="redemption-records" aria-label={t("personalRewards.redemptions")}>
    {rows.map(record => <RedemptionCard key={record.id} record={record} />)}
  </section>;
}
