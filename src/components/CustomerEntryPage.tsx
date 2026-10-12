import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CustomerPortalPage } from "@/components/CustomerPortalPage";
import { CustomerSelfServicePage } from "@/components/CustomerSelfServicePage";
import { CustomerOtpLogin } from "@/components/customer-portal/CustomerOtpLogin";
import { supabase } from "@/lib/supabase";
import { fetchPersonalOtpSession, logoutPersonalOtpSession } from "@/lib/customer-otp-session";
import { CustomerWorkspaceHeader, CustomerPortalAccessState } from "@/components/customer-portal/CustomerWorkspaceChrome";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import "@/lib/customer-portal-i18n";
import "./customer-portal.css";

export function CustomerEntryPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [params] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const requestedPersonal = !params.has("invite") && (
    location.pathname === "/customer/personal" || location.pathname.startsWith("/customer/personal/") || params.get("mode") === "personal"
  );
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setUserId(error ? null : data.session?.user.id ?? null); setLoading(false); setSessionError(Boolean(error));
    }).catch(() => { if (active) { setLoading(false); setSessionError(true); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUserId(session?.user.id ?? null); setLoading(false); setSessionError(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const [identities, setIdentities] = useState<{userId:string; organization:boolean} | null>(null);
  const [identityError, setIdentityError] = useState("");
  const [identityVersion, setIdentityVersion] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    if (!userId) { setIdentities(null); return; }
    let active = true;
    setIdentities(null); setIdentityError("");
    void Promise.resolve(supabase.rpc("customer_portal_identities")).then(({data,error}) => {
      if (!active) return;
      if (error || !data || data.personal !== true || typeof data.organization !== "boolean") {
        setIdentityError(t("portal.loadFailed")); return;
      }
      setIdentities({userId,organization:data.organization});
    }).catch(() => { if(active) setIdentityError(t("portal.loadFailed")); });
    return () => { active = false; };
  }, [userId,identityVersion,requestedPersonal,t]);
  const canSwitch = identities?.userId === userId && identities.organization;
  const personal = requestedPersonal || (!canSwitch && !params.has("invite"));
  async function signOut() {
    setLoggingOut(true);
    try {
      const revoked = await supabase.rpc("customer_personal_logout");
      if (revoked.error) throw revoked.error;
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      setIdentities(null);setUserId(null);
    } catch { setIdentityError(t("portal.operationFailed")); }
    finally { setLoggingOut(false); }
  }  const modeSelector = canSwitch ? <nav className="customer-login-modes" aria-label={t("portal.customerMode")}>
    <Link to="/customer?mode=personal" aria-current={personal ? "page" : undefined}>{t("portal.personalCustomer")}</Link>
    <Link to={params.has("invite") ? `/customer?${params.toString()}` : "/customer"} aria-current={!personal ? "page" : undefined}>{t("portal.organizationCustomer")}</Link>
  </nav> : null;
  if (loading) return <main className="customer-login-shell"><p role="status">{t("portal.loading")}</p></main>;
  if (!userId) return <>
    {sessionError && <p role="alert">{t("portal.loadFailed")}</p>}
    <CustomerOtpLogin mode={personal ? "personal" : "organization"} onVerified={() => {
      void supabase.auth.getSession().then(({ data }) => { setUserId(data.session?.user.id ?? null); });
    }} />
  </>;
  if (!identities || identities.userId !== userId) return <main className="customer-portal">
    <CustomerWorkspaceHeader mode="personal" actions={<Button variant="ghost" disabled={loggingOut} onClick={()=>void signOut()}><LogOut size={16}/>{t("portal.logout")}</Button>} />
    <CustomerPortalAccessState error={identityError} busy={false} onRetry={()=>setIdentityVersion(value=>value+1)} />
  </main>;
  return personal ? <main className="customer-portal otp-personal-workspace">
    <CustomerWorkspaceHeader mode="personal" contextSelector={modeSelector} actions={<Button variant="ghost" disabled={loggingOut} onClick={()=>void signOut()}><LogOut size={16}/>{t("portal.logout")}</Button>} />
    {identityError&&<p role="alert">{identityError}</p>}
    <CustomerSelfServicePage key={`personal-${userId}`} routeBase="/customer/personal" loginPath="/customer?mode=personal" restore={fetchPersonalOtpSession} logout={logoutPersonalOtpSession} otpOnly />
  </main> : <CustomerPortalPage key={`organization-${userId}`} contextSelector={modeSelector} onMembershipChanged={canSwitch?()=>setIdentityVersion(value=>value+1):undefined} />;
}
