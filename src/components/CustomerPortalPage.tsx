import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useMatch, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Coins, Users, MapPin, ReceiptText, Home, UserRound, Building2, UtensilsCrossed, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CornerNotice } from "@/components/ui/corner-notice";
import { supabase } from "@/lib/supabase";
import { fetchPortal, acceptPortalInvite, submitPortalOrder, portalCart, portalPermissions, fetchPortalEvidence, defaultMenuServiceDate, hongKongToday, menuValidUntil, type PaymentEvidence, type PortalPermission, type PortalSnapshot, type PortalMenu } from "@/lib/customer-portal";
import { listPortalOrderBlackouts, type OrderBlackout } from "@/lib/customer-portal-calendar-ops";
import { ReceiptPreview } from "@/components/CustomerSelfServicePage";
import type { CustomerSelfServiceOrderDetail } from "@/lib/customer-self-service";
import { printPdf } from "@/lib/print-pdf";
import { CustomerWorkspaceHeader, CustomerPortalAccessState } from "@/components/customer-portal/CustomerWorkspaceChrome";
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
import { PAYMENT_DELIVERY_URL } from "@/lib/customer-portal-sitemap";

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
  const menuId = useMatch("/customer/menus/:menuId")?.params.menuId;
  const menu = data?.menus.find(item => item.id === menuId) || null;
  function setPage(next: Page) {
    navigate(next === "home" ? "/customer" : `/customer/${next}`);
    setError("");
  }
  const [quantities, setQuantities] = useState<Record<string,number>>({});
  const [serviceDate, setServiceDate] = useState("");
  const [blackouts, setBlackouts] = useState<OrderBlackout[]>([]);
  const [addressId, setAddressId] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [inviteLink, setInviteLink] = useState(""); const [inviteEmail, setInviteEmail] = useState("");
  const [receiptOrder,setReceiptOrder]=useState(""); const [receiptFile,setReceiptFile]=useState<File|null>(null);
  const [receiptAmount,setReceiptAmount]=useState(0); const [evidence,setEvidence]=useState<PaymentEvidence[]>([]);
  const [financialDocument,setFinancialDocument]=useState<{order:CustomerSelfServiceOrderDetail;kind:"receipt"|"invoice"}|null>(null);
  const [address, setAddress] = useState({ label:"", recipient:"", phone:"", address:"" });
  const requestId = useRef<string | null>(null);
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
  async function refresh() { const next=await load(data?.organization.id);setData(next);setAddressId(current=>next.addresses.some(a=>a.id===current)?current:(next.addresses[0]?.id||"")); }
  useEffect(() => {
    if (!loggedIn) return;
    let active=true;
    setError("");
    void load(organizationId ?? undefined).then(value=>{if(active){setData(value);setAddressId(value.addresses[0]?.id||"");}})
      .catch(error=>{if(active){setError(t(portalErrorKey(error,"portal.loadFailed")));if(portalErrorKey(error,"")==="portal.membershipRequired")onMembershipChanged?.();}});
    return ()=>{active=false;};
  }, [loggedIn,load,t,organizationId]);
  useEffect(() => {
    if (!loggedIn || !data) return;
    let active = true;
    void listPortalOrderBlackouts(data.organization.id)
      .then(rows => { if (active) setBlackouts(rows ?? []); })
      .catch(() => { if (active) setBlackouts([]); });
    return () => { active = false; };
  }, [loggedIn, data?.organization.id]);
  const blockedDays = blackouts.map(day => day.blackout_on).join(",");
  useEffect(() => { setServiceDate(menu ? defaultMenuServiceDate(menu, blockedDays ? blockedDays.split(",") : []) : ""); }, [menu, blockedDays]);
  useEffect(()=>{if(page!=="receipts"||!loggedIn||!data)return;let active=true;
    void fetchPortalEvidence(data?.organization.id).then(rows=>{if(active)setEvidence(rows);}).catch(()=>{if(active)setError(t("portal.operationFailed"));});
    return()=>{active=false;};},[page,loggedIn,t,data?.organization.id]);
  async function run(action: () => Promise<unknown>, success?: string, failureKey = "portal.operationFailed") {
    if(busy)return;setBusy(true);setError("");setNotice("");
    try {await action();if(success)setNotice(success);} catch (error) {setError(t(portalErrorKey(error,failureKey)));} finally {setBusy(false);}
  }
  function chooseMenu(m: PortalMenu, previous?: PortalSnapshot["orders"][number]) {
    navigate(`/customer/menus/${encodeURIComponent(m.id)}`);requestId.current=null;setError("");
    setQuantities(previous ? Object.fromEntries(previous.lines.filter(l=>m.items.some(i=>i.product_id===l.product_id)).map(l=>[l.product_id,l.quantity])) : {});
    if(previous)setNotice(t("portal.reorderNotice"));
  }
  function applyTemplate(template: PortalSnapshot["templates"][number], targetMenu?: PortalMenu) {
    const selected = targetMenu || menu || data?.menus[0];
    if (!selected) { setError(t("portal.noMenus")); return; }
    const next = Object.fromEntries(template.items
      .map(item => {
        const match = selected.items.find(row => row.product_id === item.product_id);
        if (!match) return null;
        return [item.product_id, Math.min(item.quantity, match.available_quantity)] as const;
      })
      .filter((row): row is readonly [string, number] => row !== null && row[1] > 0));
    navigate(`/customer/menus/${encodeURIComponent(selected.id)}`);
    requestId.current = null; setError(""); setQuantities(next);
    setNotice(t(template.items.some(item => !selected.items.some(row => row.product_id === item.product_id))
      ? "portal.templatePartialNotice" : "portal.templateApplied"));
  }
  const cart=menu?portalCart(menu,quantities):null;
  async function checkout() {
    if(!menu||!data||!cart?.valid||!addressId||!serviceDate)return;
    const end = menuValidUntil(menu);
    const holiday = blackouts.find(day => day.blackout_on === serviceDate);
    if (holiday) {
      setError(t("portal.orderBlackoutNamed", { date: holiday.blackout_on, name: holiday.name }));
      return;
    }
    if (serviceDate < menu.delivery_date || serviceDate > end || serviceDate < hongKongToday()) {
      setError(t("portal.invalidServiceDate"));
      return;
    }
    requestId.current??=crypto.randomUUID();
    await run(async()=>{await submitPortalOrder(requestId.current!,menu.id,addressId,cart.items,serviceDate,data.organization.id);
      requestId.current=null;setQuantities({});setPage("orders");await refresh();},t("portal.orderCreated"));
  }

  return {t,params,setParams,loggedIn,authLoading,email,setEmail,data,page,menu,quantities,setQuantities,serviceDate,setServiceDate,blackouts,addressId,setAddressId,busy,error,setError,notice,setNotice,inviteLink,inviteEmail,setInviteEmail,receiptOrder,setReceiptOrder,receiptFile,setReceiptFile,receiptAmount,setReceiptAmount,evidence,setEvidence,financialDocument,setFinancialDocument,address,setAddress,requestId,inviteToken,refresh,run,chooseMenu,applyTemplate,cart,checkout,setPage,setData,setInviteLink};
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
  const onGuide = Boolean(useMatch("/customer/guides/:slug"));
  const {t, setParams, loggedIn, authLoading, data, setQuantities, busy, error, notice, setNotice, financialDocument, setFinancialDocument, inviteToken, refresh, run, setPage, setData, setInviteLink} = portal;
  const permissions = portalPermissions(data);
  const navItems = useMemo(() => {
    const items = nav
      .filter(([key]) => key === "home" || key === "profile"
        || ((key === "menus" || key === "vip") && permissions.ordering)
        || (key === "orders" && permissions.orders)
        || (key === "points" && permissions.points)
        || (key === "addresses" && permissions.delivery)
        || (key === "team" && (permissions.members || permissions.menus || permissions.settings)))
      .map(([key, Icon]) => ({
        key,
        icon: Icon,
        label: t(`portal.siteNav.${key === "menus" ? "cateringSite" : key === "vip" ? "eventLunch" : key === "orders" ? "orders" : key === "points" ? "rewards" : key === "profile" ? "profile" : key}`, { defaultValue: t(`portal.${key}`) }),
        end: key === "home",
        to: key === "home" ? "/customer" : `/customer/${key}`,
      }));
    const profileIndex = items.findIndex(item => item.key === "profile");
    items.splice(Math.max(profileIndex, 0), 0, { key: "paymentDelivery", icon: Truck, label: t("portal.siteNav.paymentDelivery"), end: false, to: "", href: PAYMENT_DELIVERY_URL } as typeof items[number] & { href: string });
    return items;
  }, [permissions, t]);
  async function logout() {
    await run(async () => {
      const revoked = await supabase.rpc("customer_personal_logout");
      if (revoked.error) throw revoked.error;
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      setData(null); setQuantities({}); setInviteLink(""); setPage("home");
    });
  }
  return <main className={`customer-portal${!loggedIn ? " portal-auth-shell" : ""}`}>
    {loggedIn&&<CustomerWorkspaceHeader title={data?.organization.name} mode="organization" canSwitch={canSwitch} personal={false} organizations={organizations} activeOrganizationId={activeOrganizationId} onSelectOrganization={onSelectOrganization} navItems={data ? navItems : []} loggingOut={busy} onLogout={() => void logout()} />}
    {loggedIn&&<>{error&&data&&<p role="alert" className="portal-error">{error}</p>}{notice&&<CornerNotice message={notice} onDismiss={() => setNotice("")} />}</>}
    {financialDocument&&<ReceiptPreview order={financialDocument.order} documentKind={financialDocument.kind} printReceipt={printPdf} onClose={()=>setFinancialDocument(null)}/>}
    {authLoading?<p role="status">{t("portal.loading")}</p>:!loggedIn?<CustomerOtpLogin mode="organization" modeSelector={loginIntro} />:<>
      {inviteToken&&<section><h2>{t("portal.invitation")}</h2><Button disabled={busy} onClick={()=>void run(async()=>{await acceptPortalInvite(inviteToken);setParams({});await refresh();onMembershipChanged?.();},t("portal.joined"))}>{t("portal.acceptInvite")}</Button></section>}
      {!data && !onGuide ? <CustomerPortalAccessState error={error} busy={busy} onRetry={()=>void run(refresh,undefined,"portal.loadFailed")} /> : <>
        <Routes>
          <Route element={<Outlet context={portal} />}>
            <Route path="guides/:slug" element={<CustomerGuidePage />} />
            {data ? <Route index element={<CustomerHomePage />} /> : null}
            <Route path="menus" element={<PortalPermissionGate permission="ordering"><CustomerMenusPage /></PortalPermissionGate>} />
            <Route path="menus/:menuId" element={<PortalPermissionGate permission="ordering"><CustomerMenusPage /></PortalPermissionGate>} />
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
    </>}
  </main>;
}
