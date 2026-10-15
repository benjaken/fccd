import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Building2, Mail, MapPin, ShieldCheck, UserRound } from "lucide-react";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
import { ProfileHeroArt } from "@/components/customer-portal/CustomerPersonalSettingsPages";
import { supabase } from "@/lib/supabase";

export function CustomerProfilePage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t } = portal;
  const data = portal.data;
  const [email, setEmail] = useState("");
  useEffect(() => {
    void supabase.auth.getSession().then(({ data: session }) => setEmail(session.session?.user.email ?? ""));
  }, []);
  if (!data) return null;
  const me = data.me;
  const deliveryPoint = me?.delivery_point_id
    ? data.addresses.flatMap(address => address.delivery_points).find(point => point.id === me.delivery_point_id)?.name
    : "";
  const account = email || data.organization.name;
  const initial = account.trim().slice(0, 1).toUpperCase();
  return <section className="personal-profile">
    <div className="personal-profile-banner">
      <div className="personal-profile-banner-copy">
        <h1>{t("portal.profile")}</h1>
        <p>{t("portal.profileIntro")}</p>
      </div>
      <div className="personal-profile-banner-art" aria-hidden="true"><ProfileHeroArt /></div>
    </div>
    <article className="personal-profile-card personal-profile-identity">
      <span className="personal-profile-avatar" aria-hidden="true">{initial}</span>
      <div className="personal-profile-identity-copy">
        <h2>{account}</h2>
        <p><Mail size={18} aria-hidden="true" /><span>{t("portal.roles." + data.role)}</span></p>
      </div>
    </article>
    {me ? <section className="personal-profile-card" aria-labelledby="personal-profile-facts-heading">
      <header className="personal-profile-card-head">
        <span className="personal-profile-card-icon" aria-hidden="true"><UserRound size={20} /></span>
        <div>
          <h2 id="personal-profile-facts-heading">{t("portal.memberProfile")}</h2>
        </div>
      </header>
      <ul className="personal-profile-toggles">
        <li className="personal-profile-toggle">
          <span className="personal-profile-fact-icon" aria-hidden="true"><Building2 size={18} /></span>
          <span className="personal-profile-toggle-label">{t("portal.myDepartment")}: {me.department || t("portal.memberNone")}</span>
        </li>
        <li className="personal-profile-toggle">
          <span className="personal-profile-fact-icon" aria-hidden="true"><MapPin size={18} /></span>
          <span className="personal-profile-toggle-label">{t("portal.myDeliveryPoint")}: {deliveryPoint || t("portal.memberNone")}</span>
        </li>
        {data.role === "member" ? <li className="personal-profile-toggle">
          <span className="personal-profile-fact-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
          <span className="personal-profile-toggle-label">{t("portal.memberCanOrder")}: {me.can_order ? t("portal.yes") : t("portal.no")}</span>
        </li> : null}
      </ul>
    </section> : null}
    <p className="personal-profile-note">{t("portal.otpProfileHint")}</p>
  </section>;
}
