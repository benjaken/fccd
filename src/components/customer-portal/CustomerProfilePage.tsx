import { useOutletContext } from "react-router-dom";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerProfilePage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t} = portal;
  const data = portal.data;
  if (!data) return null;
  return <section><h1>{t("portal.profile")}</h1><p>{data.organization.name}</p><p>{t("portal.roles."+data.role)}</p><p>{t("portal.otpProfileHint")}</p></section>;
}
