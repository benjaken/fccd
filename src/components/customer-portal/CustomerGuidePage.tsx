import { richTextHtml } from "@/lib/rich-text";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchPublishedGuides, type PortalGuide } from "@/lib/customer-portal-guides";

export function CustomerGuidePage() {
  const { t } = useTranslation();
  const { slug = "" } = useParams();
  const [guides, setGuides] = useState<PortalGuide[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPublishedGuides()
      .then(rows => { if (live) setGuides(rows); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) return <section><p role="alert">{t("portalGuides.operationFailed")}</p></section>;
  if (!guides) return <section><p role="status">{t("portalGuides.loading")}</p></section>;
  const guide = guides.find(item => item.slug === slug);
  if (!guide) return <section><h1>{t("portalGuides.notFound")}</h1></section>;
  return (
    <section className="portal-guide">
      <h1>{guide.title}</h1>
      {guide.body.trim() ? <div className="portal-guide-body" dangerouslySetInnerHTML={{ __html: richTextHtml(guide.body) }} /> : <p>{t("portalGuides.emptyBody")}</p>}
    </section>
  );
}
