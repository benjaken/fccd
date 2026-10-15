import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { getStorefrontLogoPath } from "@/lib/brand-logo";
import { fetchPersonalSnapshot, shopifyStoreUrl, type PersonalStore } from "@/lib/customer-personal";
import "@/lib/customer-portal-i18n";
import "@/lib/customer-personal-i18n";

export function CustomerMenusPage() {
  const { t } = useTranslation();
  const [sites, setSites] = useState<PersonalStore[] | null>(null);
  useEffect(() => {
    let active = true;
    void fetchPersonalSnapshot()
      .then(snapshot => { if (active) setSites(snapshot.stores); })
      .catch(() => { if (active) setSites([]); });
    return () => { active = false; };
  }, []);
  return (
    <section className="personal-menus">
      <h1>{t("portal.menus")}</h1>
      <p>{t("portal.menusIntro")}</p>
      {sites === null ? <p className="personal-empty" role="status" aria-busy="true">{t("portal.loading")}</p>
        : sites.length ? <ul className="personal-menu-list">
          {sites.map(site => {
            const logo = getStorefrontLogoPath(site.name, site.domain);
            return <li key={site.id}>
              <a className="personal-menu-row" href={shopifyStoreUrl(site.domain)}>
                <span className="personal-menu-logo">{logo ? <img src={logo} alt="" /> : <span aria-hidden="true">{site.name.slice(0, 1)}</span>}</span>
                <span className="personal-menu-copy">
                  <strong>{site.name}</strong>
                  <span>{site.domain}</span>
                </span>
                <span className="personal-menu-cta">{t("personal.website")}<ChevronRight size={16} aria-hidden="true" /></span>
              </a>
            </li>;
          })}
        </ul> : <EmptyState title={t("personal.noStores")} />}
      <p className="personal-menu-note">{t("personal.shopifyCheckout")}</p>
    </section>
  );
}
