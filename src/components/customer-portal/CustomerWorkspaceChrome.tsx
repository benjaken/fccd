import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";

export function CustomerWorkspaceHeader({ title, actions, contextSelector, mode = "organization" }: { title?: string; actions: ReactNode; contextSelector?: ReactNode; mode?: "personal" | "organization" }) {
  const { t } = useTranslation();
  return <>
    <header className="portal-workspace-header">
      <Link to="/customer" className="portal-brand-link" aria-label="Food Channels Catering"><img src={FOOD_CHANNEL_CATERING_LOGO_PATH} alt="Food Channels Catering" /></Link>
      <div className="portal-workspace-title"><span>{t(mode === "personal" ? "portal.personalCustomer" : "portal.organizationCustomer")}</span><strong>{title || t("portal.title")}</strong></div>
      <div className="portal-header-actions">
        {contextSelector}
        {actions}
      </div>
    </header>
  </>;
}

export function CustomerPortalAccessState({ error, busy, onRetry }: { error: string; busy: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return <section className="portal-access-state">
    <div className="portal-state-icon" aria-hidden="true">{error?<CircleAlert/>:<LoaderCircle className="animate-spin"/>}</div>
    <h1>{t(error?"portal.loadFailedTitle":"portal.loading")}</h1>
    {error?<><p role="alert">{error}</p><Button disabled={busy} onClick={onRetry}>{busy?t("portal.loading"):t("portal.retry")}</Button></>:<p role="status">{t("portal.loadingDetails")}</p>}
  </section>;
}
