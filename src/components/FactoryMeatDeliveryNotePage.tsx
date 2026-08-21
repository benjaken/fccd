import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";
import { formatDeliveryAddress } from "@/lib/delivery-address";
import {
  fetchPreparedMeatOutboundOrder,
  markPreparedMeatOutboundPrinted,
  type PreparedMeatOutboundOrder,
} from "@/lib/prepared-meat-inventory";

type NoteLoader = (orderId: string) => Promise<PreparedMeatOutboundOrder>;
type PrintMarker = (orderId: string) => Promise<void>;

function display(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function FactoryMeatDeliveryNotePage({
  loadNote = fetchPreparedMeatOutboundOrder,
  markPrinted = markPreparedMeatOutboundPrinted,
}: {
  loadNote?: NoteLoader;
  markPrinted?: PrintMarker;
}) {
  const { t, i18n } = useTranslation();
  const { meatOrderId = "" } = useParams();
  const [note, setNote] = useState<PreparedMeatOutboundOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const notSet = t("common.notSet");
  const deliveryDate = useMemo(() => {
    if (!note?.shippingAt) return notSet;
    const parsed = new Date(note.shippingAt);
    if (Number.isNaN(parsed.getTime())) return notSet;
    return new Intl.DateTimeFormat(
      i18n.language === "zh-HK" ? "en-GB" : i18n.language,
      {
        timeZone: "Asia/Hong_Kong",
        day: "numeric",
        month: "numeric",
        year: "numeric",
      },
    ).format(parsed);
  }, [i18n.language, note?.shippingAt, notSet]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void loadNote(meatOrderId)
      .then((value) => {
        if (!cancelled) setNote(value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadNote, meatOrderId]);

  const print = async () => {
    if (!note) return;
    try {
      await markPrinted(note.id);
    } catch {
      // Printing must remain available even if the status update is temporarily
      // unavailable; the factory board will simply not show it as completed.
    }
    window.print();
  };

  if (loading) {
    return <main className="factory-meat-note-state">{t("common.loading")}</main>;
  }

  if (error || !note) {
    return (
      <main className="factory-meat-note-state">
        <p>{t("factoryBoard.orderLoadError")}</p>
        <Button type="button" onClick={() => window.close()}>
          <ArrowLeft aria-hidden="true" />
          {t("factoryBoard.back")}
        </Button>
      </main>
    );
  }

  return (
    <main className="factory-meat-note-page">
      <section className="factory-meat-note-sheet">
        <header className="factory-meat-note-header">
          <div className="factory-meat-note-brand" aria-label="Food Channels Catering">
            <img src={FOOD_CHANNEL_CATERING_LOGO_PATH} alt="" aria-hidden="true" />
          </div>
          <h1>{t("factoryBoard.deliveryNoteTitle")}</h1>
          <Button
            type="button"
            className="factory-meat-note-print-button"
            onClick={() => void print()}
          >
            <Printer aria-hidden="true" />
            {t("factoryBoard.print")}
          </Button>
        </header>

        <p className="factory-meat-note-remarks">
          <strong>{t("factoryBoard.deliveryRemarks")}:</strong>
          {note.remarks ? ` ${note.remarks}` : ""}
        </p>

        <div className="factory-meat-note-details">
          <section>
            <h2>{t("factoryBoard.customerAndDeliveryAddress")}</h2>
            <strong>{display(note.customerName, notSet)}</strong>
            <p>{formatDeliveryAddress(note.address, note.shippingMethodName, notSet)}</p>
            <p>
              {t("factoryBoard.contactPerson")}: {display(note.contactPerson, notSet)}
              {note.phone ? `  ${note.phone}` : ""}
            </p>
          </section>
          <section>
            <p className="factory-meat-note-order-number">
              <strong>{t("factoryBoard.orderLabel")}</strong> {display(note.orderNumber, notSet)}
            </p>
            <p>
              <strong>{t("factoryBoard.deliveryDate")}:</strong> {deliveryDate}
            </p>
            <p>
              <strong>{t("factoryBoard.shippingMethod")}:</strong>{" "}
              {display(note.shippingMethodName, notSet)}
            </p>
          </section>
        </div>

        <table className="factory-meat-note-lines">
          <thead>
            <tr>
              <th aria-label={t("factoryBoard.portions", { count: 0 })} />
              <th>{t("factoryBoard.orderContent")}</th>
            </tr>
          </thead>
          <tbody>
            {note.lines.map((line) => (
              <tr key={`${line.kind}-${line.itemId}`}>
                <td>{line.quantity}{line.unit || "份"}</td>
                <td>
                  {line.name}
                  {line.remarks ? `（${line.remarks}）` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>第1頁/共1頁</footer>
      </section>
    </main>
  );
}
