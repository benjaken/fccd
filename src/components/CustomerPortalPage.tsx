import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Coins, Users, MapPin, ReceiptText, LogOut, Home, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { fetchPortal, acceptPortalInvite, submitPortalOrder, portalCart, fetchPortalEvidence, type PaymentEvidence, type PortalSnapshot, type PortalMenu } from "@/lib/customer-portal";
import { ReceiptPreview } from "@/components/CustomerSelfServicePage";
import type { CustomerSelfServiceOrderDetail } from "@/lib/customer-self-service";
import { printPdf } from "@/lib/print-pdf";
import "./customer-portal.css";
import "@/lib/customer-portal-i18n";

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

function useCustomerPortalController(load: typeof fetchPortal) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [loggedIn, setLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
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
    void load().then(value=>{if(active){setData(value);setAddressId(value.addresses[0]?.id||"");}})
      .catch(()=>{if(active)setError(t("portal.membershipRequired"));});
    return ()=>{active=false;};
  }, [loggedIn,load,t]);
  useEffect(()=>{if(page!=="receipts"||!loggedIn)return;let active=true;
    void fetchPortalEvidence().then(rows=>{if(active)setEvidence(rows);}).catch(()=>{if(active)setError(t("portal.operationFailed"));});
    return()=>{active=false;};},[page,loggedIn,t]);
  async function run(action: () => Promise<unknown>, success?: string) {
    if(busy)return;setBusy(true);setError("");setNotice("");
    try {await action();if(success)setNotice(success);} catch {setError(t("portal.operationFailed"));} finally {setBusy(false);}
  }
  function chooseMenu(m: PortalMenu, previous?: PortalSnapshot["orders"][number]) {
    navigate(`/customer/menus/${encodeURIComponent(m.id)}`);setPoints(0);requestId.current=null;setError("");
    setQuantities(previous ? Object.fromEntries(previous.lines.filter(l=>m.items.some(i=>i.product_id===l.product_id)).map(l=>[l.product_id,l.quantity])) : {});
    if(previous)setNotice(t("portal.reorderNotice"));
  }
  async function authenticate(event: FormEvent, signup=false) {
    event.preventDefault();await run(async()=>{
      const result=signup? await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+"/customer"+(inviteToken?"?invite="+encodeURIComponent(inviteToken):"")}}):await supabase.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      if(signup)setNotice(t("portal.verifyEmail"));
    });
  }
  const cart=menu&&data?portalCart(menu,quantities,points,data.balance):null;
  async function checkout() {
    if(!menu||!data||!cart?.valid||!addressId)return;
    requestId.current??=crypto.randomUUID();
    await run(async()=>{await submitPortalOrder(requestId.current!,menu.id,addressId,cart.items,points);
      requestId.current=null;setQuantities({});setPoints(0);setPage("orders");await refresh();},t("portal.orderCreated"));
  }

  return {t,params,setParams,loggedIn,authLoading,email,setEmail,password,setPassword,data,page,menu,quantities,setQuantities,points,setPoints,addressId,setAddressId,busy,error,setError,notice,inviteLink,inviteEmail,setInviteEmail,receiptOrder,setReceiptOrder,receiptFile,setReceiptFile,receiptAmount,setReceiptAmount,evidence,setEvidence,financialDocument,setFinancialDocument,address,setAddress,requestId,inviteToken,refresh,run,chooseMenu,authenticate,cart,checkout,setPage,setData,setInviteLink};
}

export type CustomerPortalController = ReturnType<typeof useCustomerPortalController>;

export function CustomerPortalPage({ load = fetchPortal }: { load?: typeof fetchPortal }) {
  const portal = useCustomerPortalController(load);
  const {t, setParams, loggedIn, authLoading, email, setEmail, password, setPassword, data, setQuantities, points, busy, error, notice, financialDocument, setFinancialDocument, inviteToken, refresh, run, authenticate, setPage, setData, setInviteLink} = portal;
  return <main className="customer-portal">
    <header><Link to="/customer" className="portal-wordmark">FCCD</Link><span>{data?.organization.name||t("portal.title")}</span>
      {loggedIn&&<Button variant="ghost" disabled={busy} onClick={()=>void run(async()=>{const r=await supabase.auth.signOut();if(r.error)throw r.error;setData(null);setQuantities({});setInviteLink("");setPage("home");})}><LogOut size={16}/>{t("portal.logout")}</Button>}</header>
    {error&&<p role="alert" className="portal-error">{error}</p>}{notice&&<p role="status" className="portal-notice">{notice}</p>}
    {financialDocument&&<ReceiptPreview order={financialDocument.order} documentKind={financialDocument.kind} printReceipt={printPdf} onClose={()=>setFinancialDocument(null)}/>}
    {authLoading?<p role="status">{t("portal.loading")}</p>:!loggedIn?<section className="portal-login">
      <h1>{t("portal.welcome")}</h1><p>{t("portal.loginDescription")}</p>
      <form onSubmit={authenticate}><label>{t("portal.email")}<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t("portal.emailPlaceholder")}/></label>
        <label>{t("portal.password")}<input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={t("portal.passwordPlaceholder")}/></label>
        <Button disabled={busy}>{t("portal.login")}</Button>
        {inviteToken&&<Button type="button" variant="outline" disabled={busy||!email||password.length<8} onClick={e=>void authenticate(e,true)}>{t("portal.register")}</Button>}
        <Button type="button" variant="ghost" disabled={busy||!email} onClick={()=>void run(async()=>{const r=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+"/reset-password"});if(r.error)throw r.error;},t("portal.resetSent"))}>{t("portal.forgotPassword")}</Button>
      </form><Link to="/self_service_search">{t("portal.lookup")}</Link>
    </section>:<>
      {inviteToken&&<section><h2>{t("portal.invitation")}</h2><Button disabled={busy} onClick={()=>void run(async()=>{await acceptPortalInvite(inviteToken);setParams({});await refresh();},t("portal.joined"))}>{t("portal.acceptInvite")}</Button></section>}
      {!data?<section><p>{t("portal.membershipRequired")}</p><Button disabled={busy} onClick={()=>void run(refresh)}>{t("portal.retry")}</Button></section>:<>
        <nav aria-label={t("portal.navigation")}>{nav.filter(([key])=>key!=="team"||data.role==="admin").map(([key,Icon])=><NavLink key={key} to={key === "home" ? "/customer" : `/customer/${key}`} end={key === "home"}><Icon size={18}/>{t("portal."+key)}</NavLink>)}</nav>
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
