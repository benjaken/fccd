import { Printer, ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { DeliveryListItem } from "@/lib/deliveries";
import {
  fleetBadgeChar,
  hongKongDateKey,
  type FactoryOrderJob,
} from "@/lib/factory-board";

const WEEKDAY_LONG_ZH = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

function utcWeekdayIndex(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

export function FactoryOrderJobView({
  item,
  job,
  loading,
  error,
  onBack,
}: {
  item: DeliveryListItem;
  job: FactoryOrderJob | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const empty = t("common.notSet");
  const dateKey = item.deliveryAt ? hongKongDateKey(item.deliveryAt) : "";
  const weekday = dateKey
    ? i18n.language.startsWith("zh")
      ? WEEKDAY_LONG_ZH[utcWeekdayIndex(dateKey)]
      : new Intl.DateTimeFormat(i18n.language, {
          weekday: "long",
          timeZone: "UTC",
        }).format(
          new Date(
            Date.UTC(
              Number(dateKey.slice(0, 4)),
              Number(dateKey.slice(5, 7)) - 1,
              Number(dateKey.slice(8, 10)),
            ),
          ),
        )
    : empty;
  const orderNumber = item.orderNumber?.replace(/^#/, "") || empty;
  const dispatchTime = job?.dispatchTime || item.deliveryTime || empty;
  const arrivalWindow = job?.arrivalWindow || item.deliveryTime || empty;
  const selectedName =
    fleetBadgeChar(item.motorcadeName) ||
    item.motorcadeName ||
    t("factoryBoard.unassignedFleet");

  return (
    <section className="factory-order-job">
      <div className="factory-order-main">
        <div className="factory-order-summary">
          <h1 className="factory-order-number">{orderNumber}</h1>
          <dl className="factory-order-meta">
            <div>
              {dateKey
                ? t("factoryBoard.orderDate", {
                    month: dateKey.slice(5, 7),
                    day: dateKey.slice(8, 10),
                    weekday,
                  })
                : empty}
            </div>
            <div>
              {t("factoryBoard.dispatchTime")}: {dispatchTime}
            </div>
            <div>
              {t("factoryBoard.arrivalWindow")}: {arrivalWindow}
            </div>
            <div>
              {t("factoryBoard.phone")}: {item.customerPhone || empty}
            </div>
            <div className="is-address">
              {t("factoryBoard.address")}: {item.address || empty}
            </div>
            <div className="is-customer">
              {t("factoryBoard.guestName")}: {item.customerName || empty}
            </div>
          </dl>
        </div>

        <p className="factory-order-packing">
          <ShoppingCart aria-hidden="true" />
          <span>
            {t("factoryBoard.packingNote")}: {job?.packingNote || empty}
          </span>
        </p>

        <div className="factory-order-lines" aria-busy={loading || undefined}>
          {loading ? (
            <p className="factory-day-state">{t("common.loading")}</p>
          ) : error ? (
            <p className="factory-day-state">{t("factoryBoard.orderLoadError")}</p>
          ) : !job?.lines.length ? (
            <p className="factory-day-state">{t("factoryBoard.emptyLines")}</p>
          ) : (
            job.lines.map((line) => (
              <article className="factory-order-line" key={line.id}>
                <span
                  className={
                    line.printed
                      ? "factory-order-line-print is-printed"
                      : "factory-order-line-print"
                  }
                >
                  <Printer aria-hidden="true" />
                </span>
                <strong>{line.label}</strong>
              </article>
            ))
          )}
        </div>
      </div>

      <aside className="factory-order-aside">
        <Button type="button">{t("factoryBoard.printAll")}</Button>
        <Button type="button">{t("factoryBoard.printAddress")}</Button>
        <Button type="button">{t("factoryBoard.printDeliveryNote")}</Button>
        <Button type="button" className="factory-order-selected">
          {t("factoryBoard.selectedFleet", { name: selectedName })}
        </Button>
        <hr />
        <Button
          type="button"
          variant="outline"
          className="factory-order-back"
          onClick={onBack}
        >
          {t("factoryBoard.back")}
        </Button>
        <label className="factory-order-printer">
          <span>{t("factoryBoard.connectPrinter")}</span>
          <select aria-label={t("factoryBoard.connectPrinter")} defaultValue="">
            <option value="">{t("factoryBoard.noPrinter")}</option>
          </select>
        </label>
      </aside>
    </section>
  );
}
