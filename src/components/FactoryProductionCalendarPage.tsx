import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const qz = useQzTray({ client: qzClient });
  const [qzPanelOpen, setQzPanelOpen] = useState(false);

  const returnToFactoryBoard = () => {
    window.close();
    if (!window.closed) navigate("/factory");
  };

  return (
    <main className="factory-board factory-production-calendar-page">
      <header className="factory-board-top">
        <div className="factory-board-heading factory-calendar-heading">
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
        </div>
        <div className="factory-board-actions">
          <FactoryQzTrayStatus
            qz={qz}
            open={qzPanelOpen}
            onToggle={() => setQzPanelOpen((current) => !current)}
          />
          <Button
            type="button"
            variant="outline"
            className="factory-board-multi-day factory-board-return"
            onClick={returnToFactoryBoard}
          >
            <ArrowLeft aria-hidden="true" />
            {t("factoryBoard.backToFactory")}
          </Button>
        </div>
      </header>
      <KitchenCalendarPage displayMode="factory" />
    </main>
  );
}
