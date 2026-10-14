import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
import { fetchPortalCompany, type PortalCompany } from "@/lib/customer-portal";

export function CustomerCompanyPage() {
  const { t } = useOutletContext<CustomerPortalController>();
  const [company, setCompany] = useState<PortalCompany | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void fetchPortalCompany().then(setCompany).catch(() => setFailed(true));
  }, []);
  const cycle = company?.settlementCycle;
  return <section>
    <h1>{t("portal.company")}</h1>
    <p>{t("portal.companyReadOnly")}</p>
    {failed ? <p role="alert">{t("portal.companyLoadFailed")}</p> : null}
    {!company && !failed ? <p role="status">{t("portal.loading")}</p> : null}
    {company ? <>
      <p><strong>{company.name}</strong></p>
      <p>{t("portal.brNumber")}：{company.brNumber || t("portal.companyMissing")}</p>
      <p>{t("portal.brExpires")}：{company.brExpiresOn ? new Date(company.brExpiresOn).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" }) : t("portal.companyMissing")}</p>
      <p>{t("portal.settlementCycle")}：{cycle ? t(`portal.cycles.${cycle}`) : t("portal.companyMissing")}</p>
      <h2>{t("portal.companyContacts")}</h2>
      {company.contacts.length === 0 ? <p>{t("portal.noCompanyContacts")}</p> : company.contacts.map(contact => (
        <div className="portal-row" key={`${contact.name}-${contact.phone}`}>
          <div><strong>{contact.name}</strong><p>{contact.title} · {contact.phone}</p></div>
          {contact.primary ? <span>{t("portal.primaryContact")}</span> : null}
        </div>
      ))}
    </> : null}
  </section>;
}
