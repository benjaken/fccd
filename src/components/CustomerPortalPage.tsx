import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Coins, Users, MapPin, ReceiptText, Home, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { fetchPortal, acceptPortalInvite, submitPortalOrder, portalCart, fetchPortalEvidence, type PaymentEvidence, type PortalSnapshot, type PortalMenu } from "@/lib/customer-portal";
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

type Page = "home" | "menus" | "orders" | "receipts" | "points" | "team" | "addresses" | "profile";
const nav: Array<[Page, typeof Home]> = [["home",Home],["menus",ShoppingBag],["orders",ReceiptText],["receipts",ReceiptText],["points",Coins],["team",Users],["addresses",MapPin],["profile",UserRound]];

function portalErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const parts = ["message", "details", "hint", "code"]
    .map(key => key in error ? String((error as Record<string, unknown>)[key] ?? "") : "")
    .filter(Boolean);
  return parts.join(" ");
}

function portalErrorKey(error: unknown, fallback: string) {
  const text = portalErrorText(error);
  if (text.includes("customer_membership_required")) return "portal.membershipRequired";
  if (text.includes("email_verification_required")) return "portal.verifyEmail";
  return fallback;
}

function useCustomerPortalController(load: typeof fetchPortal, onMembershipChanged?: () => void) {
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
  const [quantities, setQuantities] = useState<Record<string,number>>({}); const [points, setPoints] = useState(0);
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
  async function refresh() { const next=await load();setData(next);setAddressId(current=>next.addresses.some(a=>a.id===current)?current:(next.addresses[0]?.id||"")); }
  useEffect(() => {
    if (!loggedIn) return;
    let active=true;
    setError("");
    void load().then(value=>{if(active){setData(value);setAddressId(value.addresses[0]?.id||"");}})
      .catch(error=>{if(active){setError(t(portalErrorKey(error,"portal.loadFailed")));if(portalErrorKey(error,"")==="portal.membershipRequired")onMembershipChanged?.();}});
    return ()=>{active=false;};
  }, [loggedIn,load,t]);
  useEffect(()=>{if(page!=="receipts"||!loggedIn)return;let active=true;
    void fetchPortalEvidence().then(rows=>{if(active)setEvidence(rows);}).catch(()=>{if(active)setError(t("portal.operationFailed"));});
    return()=>{active=false;};},[page,loggedIn,t]);
  async function run(action: () => Promise<unknown>, success?: string, failureKey = "portal.operationFailed") {
    if(busy)return;setBusy(true);setError("");setNotice("");
    try {await action();if(success)setNotice(success);} catch (error) {setError(t(portalErrorKey(error,failureKey)));} finally {setBusy(false);}
  }
  function chooseMenu(m: PortalMenu, previous?: PortalSnapshot["orders"][number]) {
    navigate(`/customer/menus/${encodeURIComponent(m.id)}`);setPoints(0);requestId.current=null;setError("");
    setQuantities(previous ? Object.fromEntries(previous.lines.filter(l=>m.items.some(i=>i.product_id===l.product_id)).map(l=>[l.product_id,l.quantity])) : {});
    if(previous)setNotice(t("portal.reorderNotice"));
  }
  const cart=menu&&data?portalCart(menu,quantities,points,data.balance):null;
  async function checkout() {
    if(!menu||!data||!cart?.valid||!addressId)return;
    requestId.current??=crypto.randomUUID();
    await run(async()=>{await submitPortalOrder(requestId.current!,menu.id,addressId,cart.items,points);
      requestId.current=null;setQuantities({});setPoints(0);setPage("orders");await refresh();},t("portal.orderCreated"));
  }

  return {t,params,setParams,loggedIn,authLoading,email,setEmail,data,page,menu,quantities,setQuantities,points,setPoints,addressId,setAddressId,busy,error,setError,notice,inviteLink,inviteEmail,setInviteEmail,receiptOrder,setReceiptOrder,receiptFile,setReceiptFile,receiptAmount,setReceiptAmount,evidence,setEvidence,financialDocument,setFinancialDocument,address,setAddress,requestId,inviteToken,refresh,run,chooseMenu,cart,checkout,setPage,setData,setInviteLink};
}

export type CustomerPortalController = ReturnType<typeof useCustomerPortalController>;

export function CustomerPortalPage({ load = fetchPortal, loginIntro, canSwitch = false, onMembershipChanged }: { load?: typeof fetchPortal; loginIntro?: ReactNode; canSwitch?: boolean; onMembershipChanged?: () => void }) {
  const portal = useCustomerPortalController(load,onMembershipChanged);
  const {t, setParams, loggedIn, authLoading, data, setQuantities, busy, error, notice, financialDocument, setFinancialDocument, inviteToken, refresh, run, setPage, setData, setInviteLink} = portal;
  const navItems = useMemo(() => nav
    .filter(([key]) => key !== "team" || data?.role === "admin")
    .map(([key, Icon]) => ({
      key,
      icon: Icon,
      label: t(`portal.${key}`),
      end: key === "home",
      to: key === "home" ? "/customer" : `/customer/${key}`,
    })), [data?.role, t]);
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
    {loggedIn&&<CustomerWorkspaceHeader title={data?.organization.name} mode="organization" canSwitch={canSwitch} personal={false} navItems={data ? navItems : []} loggingOut={busy} onLogout={() => void logout()} />}
    {loggedIn&&<>{error&&data&&<p role="alert" className="portal-error">{error}</p>}{notice&&<p role="status" className="portal-notice">{notice}</p>}</>}
    {financialDocument&&<ReceiptPreview order={financialDocument.order} documentKind={financialDocument.kind} printReceipt={printPdf} onClose={()=>setFinancialDocument(null)}/>}
    {authLoading?<p role="status">{t("portal.loading")}</p>:!loggedIn?<CustomerOtpLogin mode="organization" modeSelector={loginIntro} />:<>
      {inviteToken&&<section><h2>{t("portal.invitation")}</h2><Button disabled={busy} onClick={()=>void run(async()=>{await acceptPortalInvite(inviteToken);setParams({});await refresh();onMembershipChanged?.();},t("portal.joined"))}>{t("portal.acceptInvite")}</Button></section>}
      {!data?<CustomerPortalAccessState error={error} busy={busy} onRetry={()=>void run(refresh,undefined,"portal.loadFailed")} />:<>
        <Routes>
          <Route element={<Outlet context={portal} />}>
            <Route index element={<CustomerHomePage />} />
            <Route path="menus" element={<CustomerMenusPage />} />
            <Route path="menus/:menuId" element={<CustomerMenusPage />} />
            <Route path="orders" element={<CustomerOrdersPage />} />
            <Route path="orders/:orderId" element={<CustomerOrderDetailPage />} />
            <Route path="receipts" element={<CustomerReceiptsPage />} />
            <Route path="points" element={<CustomerPointsPage />} />
            <Route path="addresses" element={<CustomerAddressesPage />} />
            <Route path="team" element={<CustomerTeamPage />} />
            <Route path="profile" element={<CustomerProfilePage />} />
            <Route path="*" element={<Navigate to="/customer" replace />} />
          </Route>
        </Routes>
      </>}
    </>}
  </main>;
}
