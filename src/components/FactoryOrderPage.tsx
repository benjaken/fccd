import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { FactoryOrderJobView } from "@/components/FactoryOrderJobView";
import { FactoryQzTrayStatus } from "@/components/FactoryQzTray";
import { FactoryBrandLogo } from "@/components/FactoryBrandLogo";
import {
  assignDeliveryMotorcade,
  fetchDeliveryById,
  type DeliveryListItem,
} from "@/lib/deliveries";
import {
  fetchFactoryFleets,
  fetchFactoryOrderJob,
  fleetBadgeForDelivery,
  markFactoryOrderLinePrinted,
  updateFactoryDispatchTime,
  type FactoryFleet,
  type FactoryOrderJob,
} from "@/lib/factory-board";
import { qzTrayClient, useQzTray, type QzTrayClient } from "@/lib/qz-tray";
import {
  fetchFactoryLabelCommand,
  type FactoryLabelCommandLoader,
} from "@/lib/factory-label";
import {
  subscribeActiveOrderEditPresence,
  type ActiveOrderEditPresenceSubscriber,
} from "@/lib/order-edit-presence";

export function FactoryOrderPage({
  loadDelivery = fetchDeliveryById,
  loadOrderJob = fetchFactoryOrderJob,
  loadFleets = fetchFactoryFleets,
  assignMotorcade = assignDeliveryMotorcade,
  markLinePrinted = markFactoryOrderLinePrinted,
  loadLabelCommand = fetchFactoryLabelCommand,
  saveDispatchTime = updateFactoryDispatchTime,
  subscribeEditPresence = subscribeActiveOrderEditPresence,
  qzClient = qzTrayClient,
}: {
  loadDelivery?: typeof fetchDeliveryById;
  loadOrderJob?: typeof fetchFactoryOrderJob;
  loadFleets?: typeof fetchFactoryFleets;
  assignMotorcade?: typeof assignDeliveryMotorcade;
  markLinePrinted?: typeof markFactoryOrderLinePrinted;
  loadLabelCommand?: FactoryLabelCommandLoader;
  saveDispatchTime?: typeof updateFactoryDispatchTime;
  subscribeEditPresence?: ActiveOrderEditPresenceSubscriber;
  qzClient?: QzTrayClient;
}) {
  const { t } = useTranslation();
  const { deliveryId = "" } = useParams();
  const navigate = useNavigate();
  const qz = useQzTray({ client: qzClient });
  const [qzPanelOpen, setQzPanelOpen] = useState(false);
  const [item, setItem] = useState<DeliveryListItem | null>(null);
  const [job, setJob] = useState<FactoryOrderJob | null>(null);
  const [fleets, setFleets] = useState<FactoryFleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [realtimeEditOrderIds, setRealtimeEditOrderIds] =
    useState<Set<string> | null>(null);

  const displayedJob = useMemo(
    () => job
      ? {
          ...job,
          isBeingEdited: realtimeEditOrderIds === null
            ? job.isBeingEdited
            : Boolean(item?.orderId && realtimeEditOrderIds.has(item.orderId)),
        }
      : null,
    [item?.orderId, job, realtimeEditOrderIds],
  );

  useEffect(
    () => subscribeEditPresence(setRealtimeEditOrderIds),
    [subscribeEditPresence],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void Promise.all([loadDelivery(deliveryId), loadFleets()])
      .then(async ([delivery, nextFleets]) => {
        if (!delivery?.orderId) throw new Error("factory_order_not_found");
        const nextJob = await loadOrderJob(delivery.orderId);
        if (cancelled) return;
        setItem(delivery);
        setFleets(nextFleets);
        setJob(nextJob);
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
  }, [deliveryId, loadDelivery, loadFleets, loadOrderJob]);

  const closePage = () => {
    window.close();
    if (!window.closed) navigate("/factory");
  };

  return (
    <main className="factory-board factory-order-page">
      <header className="factory-board-top">
        <div className="factory-board-heading factory-page-title-heading">
          <FactoryBrandLogo />
          <p className="factory-order-page-title">{t("factoryBoard.orderPageTitle")}</p>
        </div>
        <div className="factory-board-actions">
          <FactoryQzTrayStatus
            qz={qz}
            open={qzPanelOpen}
            onToggle={() => setQzPanelOpen((current) => !current)}
          />
        </div>
      </header>

      {loading ? (
        <p className="factory-order-page-state">{t("common.loading")}</p>
      ) : error || !item ? (
        <div className="factory-order-page-state">
          <p>{t("factoryBoard.orderLoadError")}</p>
          <button type="button" onClick={closePage}>{t("factoryBoard.back")}</button>
        </div>
      ) : (
        <FactoryOrderJobView
          item={item}
          job={displayedJob}
          loading={false}
          error={false}
          selectedBadge={fleetBadgeForDelivery(item, fleets)}
          fleets={fleets}
          assignMotorcade={assignMotorcade}
          markLinePrinted={markLinePrinted}
          loadLabelCommand={loadLabelCommand}
          saveDispatchTime={saveDispatchTime}
          onLinePrinted={(lineId) =>
            setJob((current) => {
              if (!current) return current;
              const lines = current.lines.map((line) =>
                line.id === lineId
                  ? { ...line, printed: true, requiresReprint: false }
                  : line,
              );
              return {
                ...current,
                lines,
                requiresReprint:
                  lines.length > 0 && lines.every((line) => line.printed)
                    ? false
                    : current.requiresReprint,
              };
            })
          }
          onAssigned={(fleet) =>
            setItem((current) =>
              current
                ? {
                    ...current,
                    motorcadeId: fleet?.id ?? null,
                    motorcadeName: fleet?.name ?? null,
                  }
                : current,
            )
          }
          onBack={closePage}
          qz={qz}
        />
      )}
    </main>
  );
}
