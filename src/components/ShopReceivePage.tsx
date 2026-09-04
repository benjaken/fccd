import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { TKO_RESTAURANT_ID } from "@/lib/shop-orders";
import {
  fetchPendingShopReceives,
  fetchShopReceives,
  hasReceiveVariance,
  isReceiveQuantityAllowed,
  receiveShopShipment,
  receiveStatusForLines,
  type ShopReceive,
} from "@/lib/shop-receive";
import type { ShopShipment } from "@/lib/shop-warehouse";

export function ShopReceivePage() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<ShopShipment[]>([]);
  const [history, setHistory] = useState<ShopReceive[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const [nextPending, nextHistory] = await Promise.all([
      fetchPendingShopReceives(TKO_RESTAURANT_ID),
      fetchShopReceives(TKO_RESTAURANT_ID),
    ]);
    setPending(nextPending);
    setHistory(nextHistory);
    const next: Record<string, string> = {};
    for (const row of nextPending) {
      for (const line of row.lines) next[line.id] = String(line.shippedQuantity);
    }
    setQuantities(next);
  };

  useEffect(() => {
    void load().catch(() => setError(t("shopReceive.loadError")));
  }, [t]);

  const confirm = async (row: ShopShipment) => {
    const lines = row.lines.map((line) => ({
      shipmentLineId: line.id,
      receivedQuantity: Number(quantities[line.id] ?? line.shippedQuantity),
      reason: reasons[line.id],
    }));
    if (lines.some((line) => !isReceiveQuantityAllowed(line.receivedQuantity))) {
      setError(t("shopReceive.qtyInvalid"));
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      const result = await receiveShopShipment(row, lines, undefined, crypto.randomUUID());
      setPending((current) => current.filter((item) => item.id !== row.id));
      setMessage(
        result.replayed
          ? t("shopReceive.replayed", { number: result.receiveNo })
          : result.status === "exception"
            ? t("shopReceive.savedException", { number: result.receiveNo })
            : t("shopReceive.saved", { number: result.receiveNo }),
      );
      setHistory(await fetchShopReceives(TKO_RESTAURANT_ID));
    } catch {
      setError(t("shopReceive.saveError"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("workspace.restaurant")}</span>
          <h1>{t("shopReceive.title")}</h1>
          <p>{t("shopReceive.description")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel">
        {message ? <p>{message}</p> : null}
        {error ? <p>{error}</p> : null}
        {pending.length === 0 && !error ? <p>{t("shopReceive.emptyPending")}</p> : null}
        {pending.map((row) => {
          const preview = receiveStatusForLines(
            row.lines.map((line) => ({
              shippedQuantity: line.shippedQuantity,
              receivedQuantity: Number(quantities[line.id] ?? line.shippedQuantity),
            })),
          );
          return (
            <div key={row.id} className="shop-review-card">
              <h2>
                {row.shipmentNo}
                {row.requestNo ? ` / ${row.requestNo}` : ""} · {row.shippedAt.slice(0, 10)}
              </h2>
              <table className="shop-order-items">
                <thead>
                  <tr>
                    <th>{t("shopOrdering.item")}</th>
                    <th>{t("shopOrdering.unit")}</th>
                    <th>{t("shopReceive.shipped")}</th>
                    <th>{t("shopReceive.received")}</th>
                    <th>{t("shopReceive.reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.lines.map((line) => {
                    const received = Number(quantities[line.id] ?? line.shippedQuantity);
                    const varied = hasReceiveVariance(line.shippedQuantity, received);
                    return (
                      <tr key={line.id}>
                        <td>{line.name}</td>
                        <td>{line.unit}</td>
                        <td>{line.shippedQuantity}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={quantities[line.id] ?? ""}
                            onChange={(event) =>
                              setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          {varied ? (
                            <input
                              value={reasons[line.id] ?? ""}
                              placeholder={t("shopReceive.reasonPlaceholder")}
                              onChange={(event) =>
                                setReasons((current) => ({ ...current, [line.id]: event.target.value }))
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview === "exception" ? <p>{t("shopReceive.willException")}</p> : null}
              <div className="shop-order-actions">
                <Button disabled={busyId === row.id} onClick={() => void confirm(row)}>
                  {t("shopReceive.confirm")}
                </Button>
              </div>
            </div>
          );
        })}
      </article>
      <article className="panel ingredients-panel">
        <h2>{t("shopReceive.historyTitle")}</h2>
        {history.length === 0 ? <p>{t("shopReceive.emptyHistory")}</p> : null}
        <table className="shop-order-items">
          <thead>
            <tr>
              <th>{t("shopOrdering.columns.number")}</th>
              <th>{t("shopOrdering.columns.status")}</th>
              <th>{t("shopReceive.receivedAt")}</th>
              <th>{t("shopOrdering.columns.lines")}</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id}>
                <td>{row.receiveNo}</td>
                <td>
                  {row.status === "exception" ? t("shopReceive.statusException") : t("shopReceive.statusReceived")}
                </td>
                <td>{row.receivedAt.slice(0, 10)}</td>
                <td>
                  {row.lines
                    .map((line) => `${line.name} ${line.receivedQuantity}/${line.shippedQuantity}`)
                    .join("、")}
                  {row.exceptions.length
                    ? ` · ${row.exceptions.map((item) => item.reason).join("、")}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
