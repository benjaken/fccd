import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { TKO_RESTAURANT_ID } from "@/lib/shop-orders";
import {
  fetchPendingShopReceives,
  fetchShopReceives,
  groupPendingShopReceives,
  hasReceiveVariance,
  isReceiveQuantityAllowed,
  receiveShopShipment,
  receiveStatusForLines,
  type ShopReceive,
  type PendingShopReceiveGroup,
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

  const confirm = async (group: PendingShopReceiveGroup) => {
    const lines = group.shipments.flatMap((shipment) => shipment.lines.map((line) => ({
      shipmentId: shipment.id,
      shipmentLineId: line.id,
      receivedQuantity: Number(quantities[line.id] ?? line.shippedQuantity),
      reason: reasons[line.id],
    })));
    if (lines.some((line) => !isReceiveQuantityAllowed(line.receivedQuantity))) {
      setError(t("shopReceive.qtyInvalid"));
      return;
    }
    setBusyId(group.key);
    setError("");
    try {
      const results = await Promise.all(group.shipments.map((shipment) =>
        receiveShopShipment(
          shipment,
          lines.filter((line) => line.shipmentId === shipment.id).map(({ shipmentId: _shipmentId, ...line }) => line),
          undefined,
          crypto.randomUUID(),
        ),
      ));
      const receiveNumbers = results.map((result) => result.receiveNo).join(" / ");
      const hasException = results.some((result) => result.status === "exception");
      const allReplayed = results.every((result) => result.replayed);
      const receivedIds = new Set(group.shipments.map((shipment) => shipment.id));
      setPending((current) => current.filter((item) => !receivedIds.has(item.id)));
      setMessage(
        allReplayed
          ? t("shopReceive.replayed", { number: receiveNumbers })
          : hasException
            ? t("shopReceive.savedException", { number: receiveNumbers })
            : t("shopReceive.saved", { number: receiveNumbers }),
      );
      setHistory(await fetchShopReceives(TKO_RESTAURANT_ID));
    } catch {
      setError(t("shopReceive.saveError"));
    } finally {
      setBusyId(null);
    }
  };

  const pendingGroups = groupPendingShopReceives(pending);

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("workspace.restaurant")}</span>
          <h1>{t("shopReceive.title")}</h1>
          <p>{t("shopReceive.description")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel shop-receive-pending">
        {message ? <p>{message}</p> : null}
        {error ? <p>{error}</p> : null}
        {pending.length === 0 && !error ? (
          <OperationalListState
            icon={PackageCheck}
            title={t("shopReceive.emptyPending")}
            description={t("shopReceive.description")}
          />
        ) : null}
        {pendingGroups.map((group) => {
          const groupLines = group.shipments.flatMap((shipment) => shipment.lines);
          const preview = receiveStatusForLines(
            groupLines.map((line) => ({
              shippedQuantity: line.shippedQuantity,
              receivedQuantity: Number(quantities[line.id] ?? line.shippedQuantity),
            })),
          );
          return (
            <div key={group.key} className="shop-review-card">
              <h2>
                {group.orderNo} · {group.shippedAt.slice(0, 10)}
              </h2>
              <div className="shop-order-table-wrap">
              <table className="shop-order-items shop-receive-table">
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
                  {groupLines.map((line) => {
                    const received = Number(quantities[line.id] ?? line.shippedQuantity);
                    const varied = hasReceiveVariance(line.shippedQuantity, received);
                    return (
                      <tr key={line.id}>
                        <td data-label={t("shopOrdering.item")}>{line.name}</td>
                        <td data-label={t("shopOrdering.unit")}>{line.unit}</td>
                        <td data-label={t("shopReceive.shipped")}>{line.shippedQuantity}</td>
                        <td data-label={t("shopReceive.received")}>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            aria-label={`${line.name} ${t("shopReceive.received")}`}
                            value={quantities[line.id] ?? ""}
                            onChange={(event) =>
                              setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                            }
                          />
                        </td>
                        <td data-label={t("shopReceive.reason")}>
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
              </div>
              {preview === "exception" ? <p>{t("shopReceive.willException")}</p> : null}
              <div className="shop-order-actions">
                <Button disabled={busyId === group.key} onClick={() => void confirm(group)}>
                  {t("shopReceive.confirm")}
                </Button>
              </div>
            </div>
          );
        })}
      </article>
      <article className="panel ingredients-panel shop-receive-history">
        <h2>{t("shopReceive.historyTitle")}</h2>
        {history.length === 0 ? (
          <OperationalListState
            icon={History}
            title={t("shopReceive.emptyHistory")}
            description={t("shopReceive.description")}
          />
        ) : (
          <div className="shop-order-table-wrap">
        <table className="shop-order-items shop-receive-history-table">
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
                <td data-label={t("shopOrdering.columns.number")}>{row.receiveNo}</td>
                <td data-label={t("shopOrdering.columns.status")}>
                  {row.status === "exception" ? t("shopReceive.statusException") : t("shopReceive.statusReceived")}
                </td>
                <td data-label={t("shopReceive.receivedAt")}>{row.receivedAt.slice(0, 10)}</td>
                <td data-label={t("shopOrdering.columns.lines")}>
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
          </div>
        )}
      </article>
    </section>
  );
}
