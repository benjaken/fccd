import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";
import { formatDeliveryAddress } from "@/lib/delivery-address";
import { printPdf } from "@/lib/print-pdf";
import {
  fetchPreparedMeatOutboundOrder,
  markPreparedMeatOutboundPrinted,
  type PreparedMeatOutboundOrder,
} from "@/lib/prepared-meat-inventory";
import { fetchShopOrderRequests } from "@/lib/shop-orders";

type NoteLoader = (orderId: string) => Promise<PreparedMeatOutboundOrder>;
type PrintMarker = (orderId: string) => Promise<void>;

function display(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function formatMeatDeliveryNoteLineQuantity(
  quantity: number,
  unit: string | null | undefined,
) {
  const quantityText = Number.isInteger(quantity)
    ? String(quantity)
    : String(quantity).replace(/\.0+$/, "");
  const unitText = unit?.trim() || "份";
  return /^\d/.test(unitText)
    ? `${quantityText} × ${unitText}`
    : `${quantityText}${unitText}`;
}

export async function fetchShopOrderDeliveryNote(
  requestId: string,
): Promise<PreparedMeatOutboundOrder> {
  const requests = await fetchShopOrderRequests({ requestId });
  const requested = requests[0];
  if (!requested) throw new Error("Shop order not found");
  const supplierOrders = requested.batchId
    ? await fetchShopOrderRequests({ batchId: requested.batchId })
    : [requested];

  return {
    id: requested.id,
    customerId: requested.restaurantId,
    customerName: requested.restaurantName ?? "",
    shippingMethodId: requested.shippingMethodId ?? null,
    shippingMethodName: requested.shippingMethodName ?? "",
    orderNumber: requested.requestNo,
    shippingAt: `${requested.deliveryDate}T00:00:00+08:00`,
    remarks: requested.note ?? "",
    sendToFactory: supplierOrders.every((order) => order.status === "sent_to_factory"),
    contactPerson: requested.deliveryContactPerson ?? "",
    phone: requested.deliveryPhone ?? "",
    address: requested.deliveryAddress ?? "",
    lines: supplierOrders.flatMap((order) => order.lines.map((line) => ({
      kind: "prepared" as const,
      itemId: line.id,
      sku: line.sku,
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      remarks: "",
    }))),
  };
}

export function FactoryMeatDeliveryNotePage({
  loadNote = fetchPreparedMeatOutboundOrder,
  markPrinted = markPreparedMeatOutboundPrinted,
  quantityOnly = false,
}: {
  loadNote?: NoteLoader;
  markPrinted?: PrintMarker;
  quantityOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { meatOrderId = "", shopRequestId = "" } = useParams();
  const noteId = shopRequestId || meatOrderId;
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
    void loadNote(noteId)
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
  }, [loadNote, noteId]);

  const print = async () => {
    if (!note) return;
    try {
      await markPrinted(note.id);
    } catch {
      // Printing must remain available even if the status update is temporarily
      // unavailable; the factory board will simply not show it as completed.
    }
    printPdf("送貨單", note.orderNumber);
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
            {note.lines.map((line) => {
              const remarks = line.remarks.trim();
              return (
                <tr key={`${line.kind}-${line.itemId}`}>
                  <td>{quantityOnly ? line.quantity : formatMeatDeliveryNoteLineQuantity(line.quantity, line.unit)}</td>
                  <td>
                    {line.name}
                    {remarks ? `（${remarks}）` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <footer>第1頁/共1頁</footer>
      </section>
    </main>
  );
}

export function FactoryShopDeliveryNotePage() {
  return (
    <FactoryMeatDeliveryNotePage
      loadNote={fetchShopOrderDeliveryNote}
      markPrinted={async () => undefined}
      quantityOnly
    />
  );
}
