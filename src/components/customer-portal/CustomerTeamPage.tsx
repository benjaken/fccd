import { useState } from "react";
import { useOutletContext, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  invitePortalMember,
  removePortalMember,
  revokePortalInvitation,
  setPortalMemberMenuScopes,
  setPortalMemberRole,
} from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerTeamPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t, busy, inviteLink, inviteEmail, setInviteEmail, refresh, run, setInviteLink } = portal;
  const data = portal.data;
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, string[]>>({});
  if (!data) return null;
  if (data.role !== "admin") return <Navigate to="/customer" replace />;
  const invitations = data.invitations ?? [];
  const orgMenus = data.org_menus ?? [];

  function menuIdsFor(member: (typeof data.members)[number]) {
    return scopeDrafts[member.user_id] ?? member.menu_ids ?? [];
  }

  function toggleMenu(userId: string, menuId: string, current: string[]) {
    const next = current.includes(menuId)
      ? current.filter(id => id !== menuId)
      : [...current, menuId];
    setScopeDrafts(draft => ({ ...draft, [userId]: next }));
  }

  return (
    <section>
      <h1>{t("portal.team")}</h1>
      <h2>{t("portal.members")}</h2>
      {data.members.map(member => {
        const selected = menuIdsFor(member);
        const unrestricted = selected.length === 0;
        return (
          <div className="portal-row portal-team-member" key={member.user_id}>
            <div>
              <strong>{member.email}</strong>
              <p>{t(`portal.roles.${member.role}`)} · {member.is_active ? t("portal.active") : t("portal.inactive")}</p>
              {member.is_active && member.role === "member" ? (
                <div className="portal-menu-scopes">
                  <p>{t("portal.menuScopesHint")}</p>
                  {orgMenus.length === 0 ? <p>{t("portal.noAssignableMenus")}</p> : null}
                  {orgMenus.map(menu => (
                    <label key={menu.id} className="portal-menu-scope-option">
                      <input
                        type="checkbox"
                        checked={selected.includes(menu.id)}
                        disabled={busy}
                        onChange={() => toggleMenu(member.user_id, menu.id, selected)}
                      />
                      <span>{menu.brand} · {menu.name} · {menu.delivery_date}</span>
                    </label>
                  ))}
                  <p className="portal-muted">{unrestricted ? t("portal.menuScopesAll") : t("portal.menuScopesSelected", { count: selected.length })}</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await setPortalMemberMenuScopes(member.user_id, selected);
                      setScopeDrafts(draft => {
                        const next = { ...draft };
                        delete next[member.user_id];
                        return next;
                      });
                      await refresh();
                    }, t("portal.menuScopesSaved"))}
                  >
                    {t("portal.saveMenuScopes")}
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="portal-actions">
              {member.is_active && member.role === "member" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await setPortalMemberRole(member.user_id, "admin");
                    await refresh();
                  }, t("portal.roleUpdated"))}
                >
                  {t("portal.promoteAdmin")}
                </Button>
              ) : null}
              {member.is_active && member.role === "admin" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await setPortalMemberRole(member.user_id, "member");
                    await refresh();
                  }, t("portal.roleUpdated"))}
                >
                  {t("portal.demoteMember")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy || !member.is_active}
                onClick={() => void run(async () => {
                  await removePortalMember(member.user_id);
                  await refresh();
                }, t("portal.saved"))}
              >
                {t("portal.remove")}
              </Button>
            </div>
          </div>
        );
      })}

      <h2>{t("portal.pendingInvites")}</h2>
      {invitations.length === 0 ? <p>{t("portal.noPendingInvites")}</p> : null}
      {invitations.map(invite => (
        <div className="portal-row" key={invite.id}>
          <div>
            <strong>{invite.email}</strong>
            <p>{t("portal.inviteExpires", { date: new Date(invite.expires_at).toLocaleString() })}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void run(async () => {
              await revokePortalInvitation(invite.id);
              await refresh();
            }, t("portal.inviteRevoked"))}
          >
            {t("portal.revokeInvite")}
          </Button>
        </div>
      ))}

      <h2>{t("portal.createInvite")}</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          void run(async () => {
            const token = await invitePortalMember(inviteEmail);
            setInviteLink(`${window.location.origin}/customer?invite=${encodeURIComponent(token)}`);
            await refresh();
          });
        }}
      >
        <label>
          {t("portal.email")}
          <input
            required
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder={t("portal.emailPlaceholder")}
          />
        </label>
        <Button disabled={busy}>{t("portal.createInvite")}</Button>
      </form>
      {inviteLink ? (
        <label>
          {t("portal.inviteLink")}
          <input readOnly value={inviteLink} onFocus={e => e.target.select()} />
        </label>
      ) : null}
    </section>
  );
}
