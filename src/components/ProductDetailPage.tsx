import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  RefreshCw,
  ShoppingBasket,
  Tags,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { fetchProductDetail, type ProductDetail } from "@/lib/products";
import { cn } from "@/lib/utils";

type DetailLoader = (id: string) => Promise<ProductDetail | null>;

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

export function ProductDetailPage({
  loadDetail = fetchProductDetail,
}: {
  loadDetail?: DetailLoader;
}) {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const [product, setProduct] = useState<ProductDetail | null>(null);
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
      setProduct(await loadDetail(id));
    } catch (loadError) {
      setError(
        typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
          ? loadError.code
          : "product_detail_failed",
      );
      setProduct(null);
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
        <span>{t("productDetail.loading")}</span>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="detail-state detail-state-error" role="alert">
        <ShoppingBasket />
        <div>
          <strong>{t("productDetail.notFound")}</strong>
          <span>{t("productDetail.notFoundDescription")}</span>
        </div>
        <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw />
          {t("productDetail.retry")}
        </Button>
      </div>
    );
  }

  const money = (value: number | null) =>
    value === null ? t("common.notSet") : currency.format(value);
  const displayName = product.chineseName || product.name;

  return (
    <section className="detail-page">
      <header className="page-heading">
        <div>
          <Link className="detail-back" to="/products">
            <ChevronLeft />
            {t("productDetail.back")}
          </Link>
          <span className="eyebrow">{t("productDetail.eyebrow")}</span>
          <h1>{displayName}</h1>
          <p>{product.sku || t("common.notSet")}</p>
        </div>
        <span
          className={cn("status-badge", product.isActive ? "green" : "amber")}
        >
          {product.isActive
            ? t("products.active")
            : product.status || t("products.inactive")}
        </span>
      </header>

      <section className="detail-grid detail-grid-two">
        <article className="panel detail-card">
          <header>
            <ShoppingBasket />
            <h2>{t("productDetail.basics")}</h2>
          </header>
          <div className="detail-fields">
            <DetailField label={t("productDetail.name")}>
              {product.name || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.chineseName")}>
              {product.chineseName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.sku")}>
              {product.sku || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.channel")}>
              {product.channelName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.type")}>
              {product.productTypeName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.cookType")}>
              {product.cookTypeName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.updated")}>
              {date.format(new Date(product.updatedAt))}
            </DetailField>
          </div>
        </article>

        <article className="panel detail-card">
          <header>
            <Tags />
            <h2>{t("productDetail.pricing")}</h2>
          </header>
          <div className="detail-fields">
            <DetailField label={t("productDetail.price")}>
              {money(product.price)}
            </DetailField>
            <DetailField label={t("productDetail.priceMin")}>
              {money(product.priceMin)}
            </DetailField>
            <DetailField label={t("productDetail.priceMax")}>
              {money(product.priceMax)}
            </DetailField>
            <DetailField label={t("productDetail.bentoMain")}>
              {product.bentoMainTypeName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.bentoColumn")}>
              {product.bentoColumnTypeName || t("common.notSet")}
            </DetailField>
            <DetailField label={t("productDetail.bentoRecommended")}>
              {product.isBentoRecommended
                ? t("common.yes")
                : t("common.no")}
            </DetailField>
            <DetailField label={t("productDetail.collections")}>
              {product.collections.length > 0
                ? product.collections.join(" · ")
                : t("common.notSet")}
            </DetailField>
          </div>
        </article>
      </section>

      <article className="panel detail-card">
        <header>
          <ShoppingBasket />
          <h2>{t("productDetail.description")}</h2>
        </header>
        <p className="detail-description">
          {product.description || t("common.notSet")}
        </p>
        {product.imageUrl ? (
          <img
            className="product-detail-image"
            src={product.imageUrl}
            alt={displayName}
          />
        ) : null}
      </article>
    </section>
  );
}
