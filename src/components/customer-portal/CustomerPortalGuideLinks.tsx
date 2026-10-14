import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchPublishedGuides, type PortalGuide } from "@/lib/customer-portal-guides";

export function CustomerPortalGuideLinks({ base, onNavigate }: { base: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const [guides, setGuides] = useState<PortalGuide[]>([]);

  useEffect(() => {
    let live = true;
    fetchPublishedGuides()
      .then(rows => { if (live) setGuides(rows); })
      .catch(() => { if (live) setGuides([]); });
    return () => { live = false; };
  }, []);

  if (!guides.length) return null;
  return (
    <nav className="customer-portal-drawer-guides" aria-label={t("portal.siteNav.guides")}>
      {guides.map(guide => (
        <NavLink key={guide.slug} to={`${base}/guides/${guide.slug}`} onClick={onNavigate}>{guide.title}</NavLink>
      ))}
    </nav>
  );
}
