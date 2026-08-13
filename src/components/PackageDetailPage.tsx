import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ListChecks,
  Package,
  RefreshCw,
  ShoppingBasket,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { fetchPackageDetail, type PackageDetail } from "@/lib/packages";
import { cn } from "@/lib/utils";

type DetailLoader = (id: string) => Promise<PackageDetail | null>;

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export function PackageDetailPage({
  loadDetail = fetchPackageDetail,
}: {
  loadDetail?: DetailLoader;
}) {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPkg(await loadDetail(id));
    } catch (loadError) {
      setError(
        typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
          ? loadError.code
          : "package_detail_failed",
      );
      setPkg(null);
    } finally {
      setLoading(false);
    }
  }, [id, loadDetail, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="detail-state" role="status">
        <RefreshCw className="spin" />
        <span>{t("packageDetail.loading")}</span>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="detail-state detail-state-error" role="alert">
        <Package />
        <div>
          <strong>{t("packageDetail.notFound")}</strong>
          <span>{t("packageDetail.notFoundDescription")}</span>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw />
          {t("packageDetail.retry")}
        </Button>
      </div>
    );
  }

  const money = (value: number | null) =>
    value === null ? t("common.notSet") : currency.format(value);
  const displayName = pkg.chineseName || pkg.name;

  return (
    <section className="detail-page">
      <header className="page-heading">
        <div>
          <Link className="detail-back" to="/products/packages">
            <ChevronLeft />
            {t("packageDetail.back")}
          </Link>
          <span className="eyebrow">{t("packageDetail.eyebrow")}</span>
          <h1>{displayName}</h1>
          <p>{pkg.sku || t("common.notSet")}</p>
        </div>
        <span className={cn("status-badge", pkg.isActive ? "green" : "amber")}>
          {pkg.isActive
            ? t("packages.active")
            : pkg.status || t("packages.inactive")}
        </span>
      </header>

      <section className="detail-grid detail-grid-two">
        <article className="panel detail-card">
          <header>
            <Package />
            <h2>{t("packageDetail.basics")}</h2>
          </header>
          <div className="detail-fields">
            <DetailField label={t("packageDetail.name")}>
              {pkg.name || t("common.notSet")}
            </DetailField>
            <DetailField label={t("packageDetail.chineseName")}>
              {pkg.chineseName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("packageDetail.sku")}>
              {pkg.sku || t("common.notSet")}
            </DetailField>
            <DetailField label={t("packageDetail.channel")}>
              {pkg.channelName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("packageDetail.price")}>
              {money(pkg.price)}
            </DetailField>
            <DetailField label={t("packageDetail.updated")}>
              {date.format(new Date(pkg.updatedAt))}
            </DetailField>
          </div>
        </article>

        <article className="panel detail-card">
          <header>
            <ListChecks />
            <h2>{t("packageDetail.choiceSets")}</h2>
          </header>
          {pkg.choiceSets.length === 0 ? (
            <p className="detail-description">{t("packageDetail.noChoiceSets")}</p>
          ) : (
            <div className="table-wrap detail-inline-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("packageDetail.choiceType")}</th>
                    <th>{t("packageDetail.maxChoices")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.choiceSets.map((choice) => (
                    <tr key={choice.id}>
                      <td>{choice.choiceType || t("common.notSet")}</td>
                      <td>
                        {choice.maximumChoices ?? t("common.notSet")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <article className="panel detail-card">
        <header>
          <ShoppingBasket />
          <h2>{t("packageDetail.members")}</h2>
        </header>
        {pkg.members.length === 0 ? (
          <p className="detail-description">{t("packageDetail.noMembers")}</p>
        ) : (
          <div className="table-wrap detail-inline-table">
            <table>
              <thead>
                <tr>
                  <th>{t("packageDetail.memberSku")}</th>
                  <th>{t("packageDetail.memberName")}</th>
                  <th>{t("packageDetail.quantity")}</th>
                  <th>{t("packageDetail.addonPrice")}</th>
                  <th>{t("packageDetail.selected")}</th>
                  <th>{t("packageDetail.memberPrice")}</th>
                </tr>
              </thead>
              <tbody>
                {pkg.members.map((member) => (
                  <tr key={member.id}>
                    <td>{member.productSku || t("common.notSet")}</td>
                    <td>
                      {member.productId ? (
                        <Link
                          className="order-link"
                          to={`/products/${member.productId}`}
                        >
                          {member.productChineseName ||
                            member.productName ||
                            t("common.notSet")}
                        </Link>
                      ) : (
                        member.productChineseName ||
                        member.productName ||
                        t("common.notSet")
                      )}
                    </td>
                    <td>{member.quantity ?? t("common.notSet")}</td>
                    <td>{money(member.addonPrice)}</td>
                    <td>
                      {member.isSelected === null
                        ? t("common.notSet")
                        : member.isSelected
                          ? t("common.yes")
                          : t("common.no")}
                    </td>
                    <td>{money(member.productPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel detail-card">
        <header>
          <Package />
          <h2>{t("packageDetail.description")}</h2>
        </header>
        <p className="detail-description">
          {pkg.description || t("common.notSet")}
        </p>
      </article>
    </section>
  );
}
