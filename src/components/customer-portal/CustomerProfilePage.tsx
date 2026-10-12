import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerProfilePage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t, email, password, error, run} = portal;
  const data = portal.data;
  if (!data) return null;
  return <section><h1>{t("portal.profile")}</h1><p>{data.organization.name}</p><p>{t("portal.roles."+data.role)}</p><Button variant="outline" onClick={()=>void run(async()=>{const user=await supabase.auth.getUser();if(!user.data.user?.email)throw new Error("email_required");const r=await supabase.auth.resetPasswordForEmail(user.data.user.email,{redirectTo:window.location.origin+"/reset-password"});if(r.error)throw r.error;},t("portal.resetSent"))}>{t("portal.forgotPassword")}</Button></section>;
}
