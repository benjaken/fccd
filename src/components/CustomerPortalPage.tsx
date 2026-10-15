import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useMatch, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Coins, Users, MapPin, ReceiptText, Home, UserRound, Building2, UtensilsCrossed, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CornerNotice } from "@/components/ui/corner-notice";
import { supabase } from "@/lib/supabase";
import { fetchPortal, acceptPortalInvite, portalPermissions, fetchPortalEvidence, type PaymentEvidence, type PortalPermission, type PortalSnapshot } from "@/lib/customer-portal";
import { ReceiptPreview } from "@/components/CustomerSelfServicePage";
import type { CustomerSelfServiceOrderDetail } from "@/lib/customer-self-service";
import { printPdf } from "@/lib/print-pdf";
import { CustomerWorkspaceHeader, CustomerPortalAccessState, type CustomerPortalNavItem } from "@/components/customer-portal/CustomerWorkspaceChrome";
import { PersonalPageSkeleton, organizationSkeletonForPath } from "@/components/customer-portal/PersonalPageSkeleton";
import "./customer-portal.css";
import "@/lib/customer-portal-i18n";

import { CustomerOtpLogin } from "@/components/customer-portal/CustomerOtpLogin";
import { CustomerHomePage } from "@/components/customer-portal/CustomerHomePage";
import { CustomerMenusPage } from "@/components/customer-portal/CustomerMenusPage";
import { CustomerOrdersPage } from "@/components/customer-portal/CustomerOrdersPage";
import { CustomerOrderDetailPage } from "@/components/customer-portal/CustomerOrderDetailPage";
import { CustomerReceiptsPage } from "@/components/customer-portal/CustomerReceiptsPage";
import { CustomerPointsPage } from "@/components/customer-portal/CustomerPointsPage";
import { CustomerAddressesPage } from "@/components/customer-portal/CustomerAddressesPage";
import { CustomerTeamPage } from "@/components/customer-portal/CustomerTeamPage";
import { CustomerProfilePage } from "@/components/customer-portal/CustomerProfilePage";
import { CustomerCompanyPage } from "@/components/customer-portal/CustomerCompanyPage";
import { OrganizationVipPage } from "@/components/customer-portal/OrganizationVipPage";
import { CustomerGuidePage } from "@/components/customer-portal/CustomerGuidePage";
import { PAYMENT_GUIDE_SLUG } from "@/lib/customer-portal-guides";

type Page = "home" | "menus" | "vip" | "orders" | "receipts" | "points" | "team" | "addresses" | "profile" | "company";
const nav: Array<[Page, typeof Home]> = [["home",Home],["menus",Globe],["vip",UtensilsCrossed],["orders",ReceiptText],["receipts",ReceiptText],["points",Coins],["team",Users],["addresses",MapPin],["company",Building2],["profile",UserRound]];

function portalErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const parts = ["message", "details", "hint", "code"]
    .map(key => key in error ? String((error as Record<string, unknown>)[key] ?? "") : "")
    .filter(Boolean);
  return parts.join(" ");
}

function portalErrorKey(error: unknown, fallback: string) {
  const text = portalErrorText(error);
  if (text.includes("order_blackout")) return "portal.orderBlackout";
  if (text.includes("delivery_date_unavailable")) return "portal.invalidServiceDate";
  if (text.includes("customer_membership_required")) return "portal.membershipRequired";
  if (text.includes("email_verification_required")) return "portal.verifyEmail";
  return fallback;
}

function useCustomerPortalController(load: typeof fetchPortal, onMembershipChanged?: () => void, organizationId?: string | null) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [loggedIn, setLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [data, setData] = useState<PortalSnapshot | null>(null);
  const navigate = useNavigate();
  const match = useMatch("/customer/:page/*");
  const page = (nav.some(([key]) => key === match?.params.page) ? match?.params.page : "home") as Page;
  function setPage(next: Page) {
    navigate(next === "home" ? "/customer" : `/customer/${next}`);
    setError("");
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [inviteLink, setInviteLink] = useState(""); const [inviteEmail, setInviteEmail] = useState("");
  const [receiptOrder,setReceiptOrder]=useState(""); const [receiptFile,setReceiptFile]=useState<File|null>(null);
  const [receiptAmount,setReceiptAmount]=useState(0); const [evidence,setEvidence]=useState<PaymentEvidence[]>([]);
  const [financialDocument,setFinancialDocument]=useState<{order:CustomerSelfServiceOrderDetail;kind:"receipt"|"invoice"}|null>(null);
  const currentUserId = useRef<string | null>(null);
  const inviteToken = params.get("invite");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({data: value}) => { if(active) {currentUserId.current=value.session?.user.id||null;setLoggedIn(Boolean(value.session));setAuthLoading(false);} });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId=session?.user.id||null;
      if(userId!==currentUserId.current){setData(null);setFinancialDocument(null);setInviteLink("");setEvidence([]);currentUserId.current=userId;}
      setLoggedIn(Boolean(session));setAuthLoading(false);
    });
    return () => {active=false;listener.subscription.unsubscribe();};
  }, []);
  async function refresh() { setData(await load(data?.organization.id)); }
  useEffect(() => {
    if (!loggedIn) return;
    let active=true;
    setError("");
    void load(organizationId ?? undefined).then(value=>{if(active){setData(value);}})
      .catch(error=>{if(active){setError(t(portalErrorKey(error,"portal.loadFailed")));if(portalErrorKey(error,"")==="portal.membershipRequired")onMembershipChanged?.();}});
    return ()=>{active=false;};
  }, [loggedIn,load,t,organizationId]);
  useEffect(()=>{if(page!=="receipts"||!loggedIn||!data)return;let active=true;
    void fetchPortalEvidence(data?.organization.id).then(rows=>{if(active)setEvidence(rows);}).catch(()=>{if(active)setError(t("portal.operationFailed"));});
    return()=>{active=false;};},[page,loggedIn,t,data?.organization.id]);
  async function run(action: () => Promise<unknown>, success?: string, failureKey = "portal.operationFailed") {
    if(busy)return false;setBusy(true);setError("");setNotice("");
    try {await action();if(success)setNotice(success);return true;} catch (error) {setError(t(portalErrorKey(error,failureKey)));return false;} finally {setBusy(false);}
  }
  return {t,params,setParams,loggedIn,authLoading,email,setEmail,data,page,busy,error,setError,notice,setNotice,inviteLink,inviteEmail,setInviteEmail,receiptOrder,setReceiptOrder,receiptFile,setReceiptFile,receiptAmount,setReceiptAmount,evidence,setEvidence,financialDocument,setFinancialDocument,inviteToken,refresh,run,setPage,setData,setInviteLink};
}

export type CustomerPortalController = ReturnType<typeof useCustomerPortalController>;

function PortalPermissionGate({ permission, children }: { permission: PortalPermission; children: ReactNode }) {
  const portal = useOutletContext<CustomerPortalController>();
  if (!portal.data || portalPermissions(portal.data)[permission]) return children;
  return <Navigate to="/customer" replace />;
}

function PortalTeamGate({ children }: { children: ReactNode }) {
  const portal = useOutletContext<CustomerPortalController>();
  const permissions = portalPermissions(portal.data);
  if (!portal.data || permissions.members || permissions.menus || permissions.settings) return children;
  return <Navigate to="/customer" replace />;
}

export function CustomerPortalPage({ load = fetchPortal, loginIntro, canSwitch = false, organizations = [], activeOrganizationId, onSelectOrganization, onMembershipChanged }: { load?: typeof fetchPortal; loginIntro?: ReactNode; canSwitch?: boolean; organizations?: Array<{ id: string; name: string }>; activeOrganizationId?: string; onSelectOrganization?: (organizationId: string) => void; onMembershipChanged?: () => void }) {
  const portal = useCustomerPortalController(load,onMembershipChanged,activeOrganizationId);
  const location = useLocation();
  const onGuide = Boolean(useMatch("/customer/guides/:slug"));
  const {t, setParams, loggedIn, authLoading, data, busy, error, setError, notice, setNotice, financialDocument, setFinancialDocument, inviteToken, refresh, run, setPage, setData, setInviteLink, page} = portal;
  const permissions = portalPermissions(data);
  const navItems = useMemo(() => {
    const items: CustomerPortalNavItem[] = nav
      .filter(([key]) => key === "home" || key === "profile" || key === "menus"
        || (key === "vip" && permissions.ordering)
        || (key === "orders" && permissions.orders)
        || (key === "points" && permissions.points)
        || (key === "addresses" && permissions.delivery)
        || (key === "company" && permissions.settings)
        || (key === "team" && (permissions.members || permissions.menus || permissions.settings)))
      .map(([key, Icon]) => ({
        key,
        icon: Icon,
        label: t(`portal.siteNav.${key === "menus" ? "cateringSite" : key === "vip" ? "eventLunch" : key === "orders" ? "orders" : key === "points" ? "rewards" : key === "profile" ? "profile" : key}`, { defaultValue: t(`portal.${key}`) }),
        end: key === "home",
        to: key === "home" ? "/customer" : `/customer/${key}`,
      }));
    const profileIndex = items.findIndex(item => item.key === "profile");
    items.splice(Math.max(profileIndex, 0), 0, { key: "paymentDelivery", icon: Truck, label: t("portal.siteNav.paymentDelivery"), end: false, to: `/customer/guides/${PAYMENT_GUIDE_SLUG}` });
    return items;
  }, [permissions, t]);
  const desktopTitle = onGuide ? t("portal.siteNav.guides") : (navItems.find(item => item.key === page)?.label ?? data?.organization.name);
  async function logout() {
    await run(async () => {
      const revoked = await supabase.rpc("customer_personal_logout");
      if (revoked.error) throw revoked.error;
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      setData(null); setInviteLink(""); setPage("home");
    });
  }
  return <main className={`customer-portal${!loggedIn ? " portal-auth-shell" : " personal-workspace"}`}>
    {loggedIn&&<CustomerWorkspaceHeader title={data?.organization.name} desktopTitle={desktopTitle} mode="organization" canSwitch={canSwitch} personal={false} organizations={organizations} activeOrganizationId={activeOrganizationId} onSelectOrganization={onSelectOrganization} navItems={data ? navItems : []} loggingOut={busy} onLogout={() => void logout()} />}
    {loggedIn&&<>{error&&data&&<CornerNotice message={error} tone="error" onDismiss={() => setError("")} />}{notice&&<CornerNotice message={notice} onDismiss={() => setNotice("")} />}</>}
    {financialDocument&&<ReceiptPreview order={financialDocument.order} documentKind={financialDocument.kind} printReceipt={printPdf} onClose={()=>setFinancialDocument(null)}/>}
    {authLoading?<p role="status">{t("portal.loading")}</p>:!loggedIn?<CustomerOtpLogin mode="organization" modeSelector={loginIntro} />:<div className="personal-content">
      {inviteToken&&<section><h2>{t("portal.invitation")}</h2><Button disabled={busy} onClick={()=>void run(async()=>{await acceptPortalInvite(inviteToken);setParams({});await refresh();onMembershipChanged?.();},t("portal.joined"))}>{t("portal.acceptInvite")}</Button></section>}
      {!data && !onGuide ? (error
        ? <CustomerPortalAccessState error={error} busy={busy} onRetry={()=>void run(refresh,undefined,"portal.loadFailed")} />
        : <PersonalPageSkeleton variant={organizationSkeletonForPath(location.pathname, location.search)} label={t("portal.loadingDetails")} />) : <>
        <Routes>
          <Route element={<Outlet context={portal} />}>
            <Route path="guides/:slug" element={<CustomerGuidePage />} />
            {data ? <Route index element={<CustomerHomePage />} /> : null}
            <Route path="menus" element={<CustomerMenusPage />} />
            <Route path="vip" element={<PortalPermissionGate permission="ordering"><OrganizationVipPage /></PortalPermissionGate>} />
            <Route path="orders" element={<PortalPermissionGate permission="orders"><CustomerOrdersPage /></PortalPermissionGate>} />
            <Route path="orders/:orderId" element={<PortalPermissionGate permission="orders"><CustomerOrderDetailPage /></PortalPermissionGate>} />
            <Route path="receipts" element={<PortalPermissionGate permission="orders"><CustomerReceiptsPage /></PortalPermissionGate>} />
            <Route path="points" element={<PortalPermissionGate permission="points"><CustomerPointsPage /></PortalPermissionGate>} />
            <Route path="addresses" element={<PortalPermissionGate permission="delivery"><CustomerAddressesPage /></PortalPermissionGate>} />
            <Route path="team" element={<PortalTeamGate><CustomerTeamPage /></PortalTeamGate>} />
            <Route path="profile" element={<CustomerProfilePage />} />
            <Route path="company" element={<CustomerCompanyPage />} />
            <Route path="*" element={<Navigate to="/customer" replace />} />
          </Route>
        </Routes>
      </>}
    </div>}
  </main>;
}
