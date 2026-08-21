import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FactoryQzTrayStatus } from "@/components/FactoryQzTray";
import { FactoryBrandLogo } from "@/components/FactoryBrandLogo";
import { KitchenCalendarPage } from "@/components/KitchenCalendarPage";
import { Button } from "@/components/ui/button";
import { qzTrayClient, useQzTray, type QzTrayClient } from "@/lib/qz-tray";

export function FactoryProductionCalendarPage({
  qzClient = qzTrayClient,
}: {
  qzClient?: QzTrayClient;
}) {
  const { t } = useTranslation();
  const qz = useQzTray({ client: qzClient });
  const [qzPanelOpen, setQzPanelOpen] = useState(false);

  return (
    <main className="factory-board factory-production-calendar-page">
      <header className="factory-board-top">
        <FactoryBrandLogo />
        <p
          className="factory-board-notice"
          aria-label={t("factoryBoard.stocktakeNotice")}
        >
          <span aria-hidden="true">📢</span>
          <span>{t("factoryBoard.stocktakeNoticeBefore")}</span>
          <span className="factory-board-notice-day">
            {t("factoryBoard.stocktakeNoticeDay")}
          </span>
          {t("factoryBoard.stocktakeNoticeAfter") ? (
            <span>{t("factoryBoard.stocktakeNoticeAfter")}</span>
          ) : null}
        </p>
        <div className="factory-board-actions">
          <FactoryQzTrayStatus
            qz={qz}
            open={qzPanelOpen}
            onToggle={() => setQzPanelOpen((current) => !current)}
          />
          <Button
            type="button"
            variant="outline"
            className="factory-board-multi-day"
            onClick={() =>
              window.open("/factory", "_blank", "noopener,noreferrer")
            }
          >
            {t("factoryBoard.multiDayMenu")}
          </Button>
        </div>
      </header>
      <KitchenCalendarPage displayMode="factory" />
    </main>
  );
}
