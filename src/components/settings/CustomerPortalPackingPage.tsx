import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { fetchPortalOpsPackingList, type OpsPackingDay } from "@/lib/customer-portal-ops";
import "@/lib/customer-packing-i18n";
import "./customer-packing.css";

function hkToday(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date(Date.now() + offsetDays * 86400000));
}

export function CustomerPortalPackingPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(hkToday());
  const [to, setTo] = useState(hkToday(7));
  const [days, setDays] = useState<OpsPackingDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const result = await fetchPortalOpsPackingList(from, to);
      setDays(Array.isArray(result?.days) ? result.days : []);
    } catch { setError(t("packing.loadFailed")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [from, to]);
  return <section className="packing-page">
    <div className="packing-toolbar">
      <DateRangePicker className="packing-range" startId="packing-start" endId="packing-end" startValue={from} endValue={to}
        startLabel={t("packing.from")} endLabel={t("packing.to")} legend={t("packing.range")}
        onStartChange={setFrom} onEndChange={setTo} />
      <Button variant="outline" onClick={() => window.print()} disabled={loading || !days.length}>{t("packing.print")}</Button>
    </div>
    {error ? <div className="packing-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>{t("packing.retry")}</Button></div> : null}
    {loading ? <p role="status" className="packing-loading">{t("packing.loading")}</p> : null}
    {!loading && !error && !days.length ? <p className="packing-empty">{t("packing.empty")}</p> : null}
    {days.map(day => <article className="packing-sheet" key={`${day.service_date}-${day.organization_id}-${day.address_id ?? ""}`}>
      <header>
        <h2>{day.service_date} · {day.organization_name}</h2>
        <p>{t("packing.deliveryPoint")}: {day.address_label || t("packing.noAddress")} · {t("packing.total")}: {day.total_quantity}</p>
      </header>
      <table>
        <thead><tr><th>{t("packing.member")}</th><th>{t("packing.department")}</th><th>{t("packing.items")}</th><th>{t("packing.quantity")}</th></tr></thead>
        <tbody>{day.lines.map((line, index) => {
          const quantity = line.items.reduce((total, item) => total + Number(item.quantity || 0), 0);
          return <tr key={`${line.member_email}-${index}`}>
            <td>{line.member_email}</td>
            <td>{line.department || "—"}</td>
            <td>{line.items.map(item => `${item.name} × ${item.quantity}`).join("、")}</td>
            <td>{quantity}</td>
          </tr>;
        })}</tbody>
      </table>
    </article>)}
  </section>;
}
