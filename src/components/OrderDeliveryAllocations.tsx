import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { DetailDelivery, DetailLine } from "@/lib/order-details";
import {
  allocationTotalMatches, fetchOrderDeliveryAllocations, saveOrderDeliveryAllocations,
  type DeliveryAllocation,
} from "@/lib/order-delivery-allocations";

export function OrderDeliveryAllocations({ orderId, lines, deliveries,
  load = fetchOrderDeliveryAllocations, save = saveOrderDeliveryAllocations,
}: {
  orderId: string; lines: DetailLine[]; deliveries: DetailDelivery[];
  load?: typeof fetchOrderDeliveryAllocations; save?: typeof saveOrderDeliveryAllocations;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const eligible = lines.filter((line) => !line.isVoid && (line.quantity ?? 0) > 0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(""); setValues({});
    void load(orderId).then((allocations) => {
      if (!cancelled) setValues(Object.fromEntries(allocations.map((a) => [`${a.orderLineId}/${a.deliveryId}`, String(a.quantity)])));
    }).catch(() => { if (!cancelled) setError(t("deliveryAllocations.loadError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, load, orderId, t]);

  const valid = deliveries.length > 0 && eligible.length > 0 && eligible.every((line) =>
    allocationTotalMatches(line.quantity ?? 0, deliveries.map((d) => Number(values[`${line.id}/${d.id}`] || 0))));
  async function submit() {
    if (!valid || loading || saving) return;
    setSaving(true); setError("");
    const allocations: DeliveryAllocation[] = eligible.flatMap((line) => deliveries.map((delivery) => ({
      orderLineId: line.id, deliveryId: delivery.id, quantity: Number(values[`${line.id}/${delivery.id}`] || 0),
    })));
    try { await save(orderId, allocations); setOpen(false); }
    catch { setError(t("deliveryAllocations.saveError")); }
    finally { setSaving(false); }
  }
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>{t("deliveryAllocations.title")}</Button>
    <Modal open={open} title={t("deliveryAllocations.title")} description={t("deliveryAllocations.description")}
      closeLabel={t("common.close")} size="lg" onClose={() => { if (!saving) setOpen(false); }}
      closeOnEscape={!saving} closeOnBackdrop={!saving}
      footer={<Button disabled={!valid || loading || saving || Boolean(error && loading)} onClick={() => void submit()}>
        {saving ? t("deliveryAllocations.saving") : t("deliveryAllocations.save")}
      </Button>}>
      {error && <p role="alert">{error}</p>}
      {loading ? <p role="status">{t("deliveryAllocations.loading")}</p> :
        <div className="grid gap-4">
          {deliveries.length === 0 && <p>{t("deliveryAllocations.noDeliveries")}</p>}
          {eligible.map((line) => <fieldset key={line.id} className="grid gap-3 rounded-lg border p-4">
            <legend>{line.productName || line.sku || "—"} · {t("deliveryAllocations.total", { quantity: line.quantity })}</legend>
            {deliveries.map((delivery, index) => {
              const key = `${line.id}/${delivery.id}`;
              const label = t("deliveryAllocations.leg", { number: index + 1 });
              return <label key={delivery.id} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                <span>{label} · {delivery.deliveryAt ? new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Hong_Kong",
                }).format(new Date(delivery.deliveryAt)) : "—"} · {delivery.status}</span>
                <Input type="number" min="0" step="0.001" aria-label={`${line.productName || line.sku || "—"} ${label}`}
                  disabled={saving} value={values[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
              </label>;
            })}
            {!allocationTotalMatches(line.quantity ?? 0, deliveries.map((d) => Number(values[`${line.id}/${d.id}`] || 0))) &&
              <p role="status">{t("deliveryAllocations.totalMismatch")}</p>}
          </fieldset>)}
        </div>}
    </Modal>
  </>;
}
