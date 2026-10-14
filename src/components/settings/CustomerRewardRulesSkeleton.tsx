import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { useTranslation } from "react-i18next";

const bone = (className = "") => <span className={`page-skeleton-bone reward-rule-bone ${className}`} />;

export function CustomerRewardRulesSkeleton({ label, canEdit }: { label: string; canEdit: boolean }) {
  const { t } = useTranslation();
  return <section className="reward-rules-page" aria-busy="true">
    <span className="sr-only" role="status">{label}</span>
    <div className="reward-rules-main">
      <section className="reward-rule-current" aria-hidden="true">
        <div className="reward-rule-section-heading">
          {bone("reward-rule-bone-heading")}
          <div className="reward-rules-actions">{bone("reward-rule-bone-badge")}{canEdit ? bone("reward-rule-bone-button") : null}</div>
        </div>
        <div className="reward-rule-banner reward-rule-banner-skeleton">
          <div className="reward-rule-skeleton-stack">{bone("reward-rule-bone-label")}{bone("reward-rule-bone-statement")}{bone()}</div>
          <aside className="reward-rule-skeleton-stack">{bone("reward-rule-bone-label")}{bone()}{bone("reward-rule-bone-statement")}{bone()}</aside>
        </div>
        <div className="reward-rule-facts">{Array.from({ length: 3 }, (_, index) => <article className="reward-rule-skeleton-stack" key={index}>{bone("reward-rule-bone-label")}{bone()}</article>)}</div>
      </section>
      <section className="reward-rule-history">
        <div className="reward-rule-section-heading" aria-hidden="true">{bone("reward-rule-bone-heading")}{bone("reward-rule-bone-label")}</div>
        <div className="reward-rule-history-tools" aria-hidden="true">{bone("reward-rule-bone-copy")}{bone("reward-rule-bone-search")}</div>
        <div className="operational-table-wrap"><table aria-label={t("portalRewardRules.history")}><thead><tr>{["versionLabel", "hkdPerPoint", "effectiveAt", "createdAt", "status", "viewVersion"].map(key => <th key={key}>{t(`portalRewardRules.${key}`)}</th>)}</tr></thead><tbody><TableSkeletonRows columns={6} rows={5} /></tbody></table></div>
      </section>
    </div>
  </section>;
}
