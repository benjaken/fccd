import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Minus, Plus, Utensils } from "lucide-react";
import type { LunchboxItem } from "@/lib/customer-lunchbox";
import "@/lib/personal-lunchbox-i18n";
import "@/lib/customer-personal-i18n";

export const lunchboxArtwork = "/assets/customer-personal/lunchbox-empty.png";

export const lunchboxMoney = (value: number) => `HK$${new Intl.NumberFormat("en-HK", { maximumFractionDigits: 2 }).format(value)}`;

const HONG_KONG = "Asia/Hong_Kong";

/** Format a cutoff timestamp into the labelled date and Hong Kong time shown in the ordering notice. */
export function cutoffParts(value: string | null | undefined, language: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = new Intl.DateTimeFormat(language, { timeZone: HONG_KONG, year: "numeric", month: "long", day: "numeric" }).format(date);
  const weekday = new Intl.DateTimeFormat(language, { timeZone: HONG_KONG, weekday: "short" }).format(date);
  const time = new Intl.DateTimeFormat(language, { timeZone: HONG_KONG, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  return { date: `${day} (${weekday})`, time };
}

export function FoodImage({ item, large = false }: { item: LunchboxItem; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return item.image_url && !failed ? <div className="lunchbox-food-media" aria-busy={!loaded}>
    <img className="lunchbox-food-image" src={item.image_url} alt={item.name} loading={large ? "eager" : "lazy"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    {!loaded ? <span className="page-skeleton-bone lunchbox-image-skeleton" aria-hidden="true" /> : null}
  </div> : <div className="lunchbox-food-placeholder"><Utensils size={large ? 56 : 32} aria-hidden="true" /></div>;
}

export function Quantity({ name, value, max, onChange }: { name: string; value: number; max: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  return <div className="lunchbox-quantity" role="group" aria-label={t("personal.quantityLabel", { name })}>
    <button type="button" aria-label={t("lunchbox.decrease", { name })} disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus size={18} /></button>
    <output aria-live="polite">{value}</output>
    <button type="button" aria-label={t("lunchbox.increase", { name })} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={18} /></button>
  </div>;
}

export function LunchboxNotice({ cutoff }: { cutoff: { date: string; time: string } | null }) {
  const { t } = useTranslation();
  if (!cutoff) return null;
  return <div className="lunchbox-notice">
    <span className="lunchbox-notice-icon" aria-hidden="true"><CalendarDays size={26} /></span>
    <span className="lunchbox-notice-copy">
      <span className="lunchbox-notice-label">{t("lunchbox.cutoffLabel")}</span>
      <strong>{cutoff.date}</strong>
      <span className="lunchbox-notice-time">{cutoff.time}{t("lunchbox.hongKongTime")}</span>
    </span>
    <img className="lunchbox-notice-art" src={lunchboxArtwork} alt="" aria-hidden="true" />
  </div>;
}
