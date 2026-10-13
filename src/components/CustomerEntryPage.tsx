import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CustomerPortalPage } from "@/components/CustomerPortalPage";
import { CustomerOtpLogin } from "@/components/customer-portal/CustomerOtpLogin";
import { supabase } from "@/lib/supabase";
import { CustomerPersonalWorkspace } from "@/components/customer-portal/CustomerPersonalWorkspace";
import { CustomerOrganizationApplicationPage } from "@/components/customer-portal/CustomerOrganizationApplicationPage";
import { CustomerWorkspaceHeader, CustomerPortalAccessState } from "@/components/customer-portal/CustomerWorkspaceChrome";
import "@/lib/customer-portal-i18n";
import "@/lib/customer-personal-i18n";
import "./customer-portal.css";
import "./customer-portal/customer-personal.css";

export function CustomerEntryPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [params] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const applying = location.pathname === "/customer/apply" || location.pathname.startsWith("/customer/apply/");
  const requestedPersonal = !applying && !params.has("invite") && (
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
      if (error) {
        const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ");
        setIdentityError(t(text.includes("email_verification_required") ? "portal.verifyEmail" : "portal.loadFailed"));
        return;
      }
      if (!data || data.personal !== true || typeof data.organization !== "boolean") {
        setIdentityError(t("portal.loadFailed")); return;
      }
      setIdentities({userId,organization:data.organization});
    }).catch(() => { if(active) setIdentityError(t("portal.loadFailed")); });
    return () => { active = false; };
  }, [userId,identityVersion,requestedPersonal,t]);
  const canSwitch = identities?.userId === userId && identities.organization;
  const personal = !applying && (requestedPersonal || (!canSwitch && !params.has("invite")));
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
  }
  if (loading) return <main className="customer-login-shell"><p role="status">{t("portal.loading")}</p></main>;
  if (!userId) return <>
    {sessionError && <p role="alert">{t("portal.loadFailed")}</p>}
    <CustomerOtpLogin mode={personal ? "personal" : "organization"} onVerified={() => {
      void supabase.auth.getSession().then(({ data }) => { setUserId(data.session?.user.id ?? null); });
    }} />
  </>;
  if (!identities || identities.userId !== userId) return <main className={`customer-portal${personal ? " personal-workspace" : ""}`}>
    <CustomerWorkspaceHeader desktopTitle={personal ? t("personal.home") : undefined} mode={personal ? "personal" : "organization"} personal={personal} loggingOut={loggingOut} onLogout={() => void signOut()} />
    <CustomerPortalAccessState error={identityError} busy={false} onRetry={()=>setIdentityVersion(value=>value+1)} />
  </main>;
  if (applying) {
    if (identities.organization) return <Navigate to="/customer" replace />;
    return <CustomerOrganizationApplicationPage loggingOut={loggingOut} onLogout={() => void signOut()} />;
  }
  return personal ? <CustomerPersonalWorkspace key={`personal-${userId}`} canSwitch={Boolean(canSwitch)} loggingOut={loggingOut} onLogout={() => void signOut()} /> : <CustomerPortalPage key={`organization-${userId}`} canSwitch={canSwitch} onMembershipChanged={canSwitch?()=>setIdentityVersion(value=>value+1):undefined} />;
}
