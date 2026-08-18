import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Printer,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  qzStatusMeta,
  useQzTray,
  type QzPrinterStatus,
} from "@/lib/qz-tray";
import { cn } from "@/lib/utils";

type QzState = ReturnType<typeof useQzTray>;

function statusBadgeClassName(tone: string) {
  return cn("factory-qz-status-badge", `is-${tone}`);
}

export function FactoryQzTrayStatus({
  qz,
  open,
  onToggle,
}: {
  qz: QzState;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const chipLabel =
    qz.state === "connecting"
      ? t("factoryBoard.qzConnecting")
      : qz.state === "connected"
        ? t("factoryBoard.qzConnected", { count: qz.printers.length })
        : qz.state === "failed"
          ? t("factoryBoard.qzNotRunning")
          : t("factoryBoard.qzChecking");

  const chipTone =
    qz.state === "connected"
      ? "is-connected"
      : qz.state === "connecting"
        ? "is-connecting"
        : "is-failed";

  return (
    <div className="factory-qz">
      <Button
        type="button"
        variant="ghost"
        className={cn("factory-qz-chip", chipTone)}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={chipLabel}
      >
        <Printer aria-hidden="true" />
        <span>{chipLabel}</span>
        {qz.printers.length > 0 && (
          <strong>{qz.printers.length.toLocaleString()}</strong>
        )}
        <ChevronDown
          className={cn("factory-qz-chevron", open && "is-open")}
          aria-hidden="true"
        />
      </Button>

      {open && (
        <div className="factory-qz-panel" role="region" aria-label={chipLabel}>
          <header className="factory-qz-panel-header">
            <span>{t("factoryBoard.qzPrinters")}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void qz.connect()}
              aria-label={t("factoryBoard.qzRefresh")}
              title={t("factoryBoard.qzRefresh")}
            >
              <RefreshCw />
            </Button>
          </header>

          {qz.state === "connecting" ? (
            <p className="factory-qz-panel-state">{t("factoryBoard.qzConnecting")}</p>
          ) : qz.state === "failed" ? (
            <div className="factory-qz-panel-state is-failed" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>{t("factoryBoard.qzNotRunningDescription")}</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void qz.connect()}
              >
                {t("factoryBoard.qzRetry")}
              </Button>
            </div>
          ) : qz.printers.length === 0 ? (
            <p className="factory-qz-panel-state">{t("factoryBoard.qzNoPrinters")}</p>
          ) : (
            <ul className="factory-qz-printer-list">
              {qz.statuses.map((printer) => (
                <PrinterStatusRow key={printer.name} printer={printer} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function PrinterStatusRow({
  printer,
}: {
  printer: QzPrinterStatus;
}) {
  const { t } = useTranslation();
  const meta = qzStatusMeta(printer.status);
  const label = t(`factoryBoard.qzStatus.${meta.key}`);

  return (
    <li className="factory-qz-printer-row">
      <Printer aria-hidden="true" />
      <span className="factory-qz-printer-name">{printer.name}</span>
      <span className={statusBadgeClassName(meta.tone)}>{label}</span>
    </li>
  );
}

export function FactoryQzTrayBanner({
  qz,
}: {
  qz: QzState;
}) {
  const { t } = useTranslation();

  if (qz.state === "connected") {
    return (
      <div className="factory-qz-banner is-connected" role="status">
        <Printer aria-hidden="true" />
        <span>
          {t("factoryBoard.qzBannerConnected", { count: qz.printers.length })}
        </span>
      </div>
    );
  }

  if (qz.state === "connecting") {
    return (
      <div className="factory-qz-banner is-connecting" role="status">
        <Printer aria-hidden="true" />
        <span>{t("factoryBoard.qzChecking")}</span>
      </div>
    );
  }

  if (qz.state === "failed") {
    return (
      <div className="factory-qz-banner is-failed" role="alert">
        <TriangleAlert aria-hidden="true" />
        <span>{t("factoryBoard.qzBannerFailed")}</span>
        <Button
          type="button"
          variant="outline"
          onClick={() => void qz.connect()}
          className="factory-qz-banner-retry"
        >
          <RefreshCw />
          {t("factoryBoard.qzRetry")}
        </Button>
      </div>
    );
  }

  return null;
}
