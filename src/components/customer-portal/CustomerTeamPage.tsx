import { useOutletContext, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { invitePortalMember, removePortalMember } from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerTeamPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t, email, busy, inviteLink, inviteEmail, setInviteEmail, refresh, run, setInviteLink} = portal;
  const data = portal.data;
  if (!data) return null;
  if (data.role !== "admin") return <Navigate to="/customer" replace />;
  return <section><h1>{t("portal.team")}</h1>{data.members.map(m=><div className="portal-row" key={m.user_id}><span>{m.email} · {t("portal.roles."+m.role)} · {m.is_active?t("portal.active"):t("portal.inactive")}</span><Button variant="outline" disabled={busy||!m.is_active} onClick={()=>void run(async()=>{await removePortalMember(m.user_id);await refresh();},t("portal.saved"))}>{t("portal.remove")}</Button></div>)}<form onSubmit={e=>{e.preventDefault();void run(async()=>{const token=await invitePortalMember(inviteEmail);setInviteLink(window.location.origin+"/customer?invite="+encodeURIComponent(token));});}}><label>{t("portal.email")}<input required type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder={t("portal.emailPlaceholder")}/></label><Button disabled={busy}>{t("portal.createInvite")}</Button></form>{inviteLink&&<label>{t("portal.inviteLink")}<input readOnly value={inviteLink} onFocus={e=>e.target.select()}/></label>}</section>;
}
