import { useTranslation } from "react-i18next";
import "@/lib/customer-personal-i18n";
import "./personal-skeleton.css";

export type PersonalSkeletonVariant = "home" | "menus" | "lunchbox" | "lunchbox-detail" | "orders" | "order-detail" | "addresses" | "profile" | "payments" | "guide" | "feedback" | "points" | "catalog" | "ledger" | "vouchers" | "vip" | "receipts" | "team" | "company";

/** Resolve the requested route before account data has loaded, including direct detail URLs. */
export function personalSkeletonForPath(pathname: string, search = ""): PersonalSkeletonVariant {
  const route = pathname.replace(/\/+$/, "").replace(/^\/customer(?:\/personal)?\/?/, "");
  if (!route) return new URLSearchParams(search).has("addonCheckout") ? "order-detail" : "home";
  if (route.startsWith("guides/")) return "guide";
  if (route.startsWith("feedback/")) return "feedback";
  const [page, detail] = route.split("/");
  if (page === "lunchbox") return detail ? "lunchbox-detail" : "lunchbox";
  if (["menus", "orders", "addresses", "profile", "payments", "points"].includes(page)) return page as PersonalSkeletonVariant;
  return "order-detail";
}

/** Resolve the organization (institution) portal route before its data has loaded. */
export function organizationSkeletonForPath(pathname: string, _search = ""): PersonalSkeletonVariant {
  const route = pathname.replace(/\/+$/, "").replace(/^\/customer\/?/, "");
  if (!route) return "home";
  if (route.startsWith("guides/")) return "guide";
  const [page, detail] = route.split("/");
  if (["menus", "points", "addresses", "profile"].includes(page)) return page as PersonalSkeletonVariant;
  if (page === "orders") return detail ? "order-detail" : "orders";
  if (page === "vip") return "vip";
  if (page === "receipts") return "receipts";
  if (page === "team") return "team";
  if (page === "company") return "company";
  return "home";
}

export function PersonalSkeletonBone({ shape = "line", className = "" }: { shape?: string; className?: string }) {
  return <span aria-hidden="true" className={`page-skeleton-bone ps-bone ps-${shape} ${className}`} />;
}
const Bone = PersonalSkeletonBone;
function Copy({ lines = 2 }: { lines?: number }) {
  return <div className="ps-stack">{Array.from({ length: lines }, (_, index) => <Bone key={index} className={index === lines - 1 ? "ps-short" : ""} />)}</div>;
}
function Heading() { return <div className="ps-stack ps-heading"><Bone shape="title" /><Copy /></div>; }
function Hero({ action = false }: { action?: boolean }) {
  return <div className="ps-hero"><div className="ps-stack"><Bone shape="title" /><Copy />{action ? <Bone shape="button" /> : null}</div><Bone shape="art" /></div>;
}
function Rows({ count = 3, actions = false }: { count?: number; actions?: boolean }) {
  return <div className="ps-stack">{Array.from({ length: count }, (_, index) => <div className="ps-row" key={index}><Bone shape="icon" /><div className="ps-stack ps-grow"><Bone shape="subtitle" /><Copy /></div>{actions ? <Bone shape="button" /> : <Bone shape="badge" />}</div>)}</div>;
}
function Fields({ count = 4 }: { count?: number }) {
  return <div className="ps-fields">{Array.from({ length: count }, (_, index) => <div className="ps-stack" key={index}><Bone shape="label" /><Bone shape="input" /></div>)}</div>;
}
function Catalog() {
  return <><Bone shape="subtitle" /><div className="ps-grid ps-catalog">{Array.from({ length: 4 }, (_, index) => <div className="ps-card ps-stack" key={index}><Bone shape="product" /><Bone shape="subtitle" /><Copy /><Bone shape="button" /></div>)}</div></>;
}
function OrderCards() {
  return <div className="ps-stack">{Array.from({ length: 3 }, (_, index) => <div className="ps-card ps-stack" key={index}><div className="ps-between"><Bone shape="subtitle" /><Bone shape="price" /></div><Bone /><div className="ps-actions"><Bone shape="badge" /><Bone shape="badge" /></div><div className="ps-actions ps-order-actions"><Bone shape="button" /><Bone shape="button" /><Bone shape="icon" /></div></div>)}</div>;
}

function Content({ variant }: { variant: PersonalSkeletonVariant }) {
  switch (variant) {
    case "home": return <><Hero action /><div className="ps-shortcuts">{Array.from({ length: 4 }, (_, index) => <div className="ps-card ps-stack" key={index}><Bone shape="icon" /><Bone shape="label" /></div>)}</div><div className="ps-grid ps-home-status"><div className="ps-hero"><Copy lines={3} /><Bone shape="art" /></div><div className="ps-hero"><Copy lines={3} /><Bone shape="art" /></div></div><div className="ps-card ps-stack"><Bone shape="subtitle" /><Rows count={2} /></div><div className="ps-card ps-stack"><Bone shape="subtitle" /><div className="ps-grid"><Bone shape="product" /><Bone shape="product" /></div></div></>;
    case "menus": return <><Heading /><Rows actions /><Bone /></>;
    case "lunchbox": return <><div className="ps-row"><Bone shape="icon" /><Copy /><Bone shape="badge" /></div><Catalog /><div className="ps-hero ps-cart"><div className="ps-stack"><Bone shape="label" /><Bone shape="price" /></div><Bone shape="button" /></div></>;
    case "lunchbox-detail": return <><Bone shape="button" /><Bone shape="food-detail" /><div className="ps-card ps-stack"><div className="ps-between"><Bone shape="title" /><Bone shape="price" /></div><Copy lines={3} /><div className="ps-between ps-divider"><Bone shape="subtitle" /><Bone shape="button" /></div><Bone shape="input" /></div></>;
    case "orders": return <><Heading /><OrderCards /></>;
    case "order-detail": return <><Bone shape="button" /><div className="ps-between"><Bone shape="title" /><Bone shape="badge" /></div><div className="ps-actions"><Bone shape="button" /><Bone shape="button" /></div><div className="ps-card ps-stack"><div className="ps-between"><Bone shape="subtitle" /><Bone shape="price" /></div><Rows /><div className="ps-summary"><Copy lines={3} /><Copy lines={3} /></div></div><div className="ps-card ps-stack"><Bone shape="subtitle" /><Fields count={4} /></div></>;
    case "addresses": return <><Hero action /><Bone shape="subtitle" /><Rows actions /><div className="ps-hero"><Copy lines={3} /></div></>;
    case "profile": return <><Hero /><div className="ps-row"><Bone shape="avatar" /><div className="ps-grow ps-stack"><Bone shape="subtitle" /><Copy /></div></div><div className="ps-card ps-stack"><Bone shape="subtitle" /><Fields count={3} /></div><div className="ps-card ps-stack"><Bone shape="subtitle" /><Rows count={2} /></div></>;
    case "payments": return <><Heading /><div className="ps-card ps-stack"><Fields count={2} /><Bone shape="upload" /><Bone shape="button" /></div><Bone shape="subtitle" /><Rows count={2} /></>;
    case "guide": return <><Bone shape="title" /><div className="ps-article">{Array.from({ length: 3 }, (_, index) => <div className="ps-stack" key={index}><Bone shape="subtitle" /><Copy lines={4} /></div>)}</div></>;
    case "feedback": return <><Heading /><Bone shape="subtitle" /><div className="ps-card ps-stack"><Bone shape="label" /><Bone shape="upload" /><Bone shape="button" /></div></>;
    case "points": return <><Hero /><div className="ps-hero ps-points-balance"><Bone shape="avatar" /><div className="ps-stack ps-grow"><Bone shape="subtitle" /><Bone shape="number" /><Bone shape="badge" /></div></div><Catalog /><Bone shape="subtitle" /><Rows count={2} /><Bone shape="subtitle" /><Rows count={2} /></>;
    case "catalog": return <Catalog />;
    case "ledger": return <Rows count={2} />;
    case "vouchers": return <><Bone shape="subtitle" /><Rows count={2} /></>;
    case "vip": return <><Heading /><div className="ps-card ps-stack"><Bone shape="subtitle" /><Rows count={3} /></div><div className="ps-card ps-stack"><Bone shape="subtitle" /><Rows count={3} /></div><Bone shape="button" /></>;
    case "receipts": return <><Heading /><div className="ps-card ps-stack"><Fields count={2} /><Bone shape="upload" /><Bone shape="button" /></div><Bone shape="subtitle" /><Rows count={2} /><Bone shape="subtitle" /><Rows count={3} /></>;
    case "team": return <><Heading /><div className="ps-card ps-stack"><Bone shape="subtitle" /><Fields count={4} /></div><Rows count={3} actions /></>;
    case "company": return <><Heading /><div className="ps-card ps-stack"><Bone shape="subtitle" /><Fields count={4} /></div><div className="ps-card ps-stack"><Bone shape="subtitle" /><Rows count={3} /></div></>;
  }
}

export function PersonalPageSkeleton({ variant, label }: { variant: PersonalSkeletonVariant; label?: string }) {
  const { t } = useTranslation();
  return <section className={`personal-page-skeleton ps-view-${variant}`} role="status" aria-busy="true" aria-label={label || t("personal.loading")} data-skeleton={variant}>
    <div className="ps-layout" aria-hidden="true"><Content variant={variant} /></div>
  </section>;
}
