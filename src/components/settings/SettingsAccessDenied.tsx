import { useTranslation } from "react-i18next";
import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function SettingsAccessDenied() {
  const { t } = useTranslation();

  return (
    <section className="placeholder-page" role="alert">
      <div className="placeholder-icon">
        <ShieldX />
      </div>
      <span className="eyebrow">{t("settings.eyebrow")}</span>
      <h1>{t("settings.accessDenied")}</h1>
      <p>{t("settings.accessDeniedDescription")}</p>
      <Button asChild>
        <Link to="/">{t("navigation.overview")}</Link>
      </Button>
    </section>
  );
}
