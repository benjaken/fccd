import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export function OrderFactorySettingsControls({
  doNotSendToFactory,
  suppressFactoryReprint,
  onDoNotSendChange,
  onSuppressFactoryReprintChange,
  actions,
  className,
}: {
  doNotSendToFactory: boolean;
  suppressFactoryReprint: boolean;
  onDoNotSendChange: (checked: boolean) => void;
  onSuppressFactoryReprintChange: (checked: boolean) => void;
  actions?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <section
      className={cn("order-factory-controls", className)}
      aria-label={t("orderEditor.factorySettings.title")}
    >
      <h3>{t("orderEditor.factorySettings.title")}</h3>
      <label>
        <input
          type="checkbox"
          checked={doNotSendToFactory}
          onChange={(event) => onDoNotSendChange(event.target.checked)}
        />
        <span>
          <strong>{t("orderEditor.factorySettings.doNotSend")}</strong>
          <small>{t("orderEditor.factorySettings.doNotSendHint")}</small>
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={suppressFactoryReprint}
          onChange={(event) =>
            onSuppressFactoryReprintChange(event.target.checked)
          }
        />
        <span>
          <strong>{t("orderEditor.factorySettings.suppressReprint")}</strong>
          <small>{t("orderEditor.factorySettings.suppressReprintHint")}</small>
        </span>
      </label>
      {actions ? <div className="order-detail-factory-actions">{actions}</div> : null}
    </section>
  );
}
