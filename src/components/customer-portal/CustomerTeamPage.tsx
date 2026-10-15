import { useEffect, useState } from "react";
import { useOutletContext, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  formatMenuPeriod,
  invitePortalMember,
  memberPermissionGrants,
  portalPermissionKeys,
  portalPermissions,
  removePortalMember,
  revokePortalInvitation,
  setPortalMemberMenuScopes,
  setPortalMemberPermission,
  setPortalMemberProfile,
  setPortalMemberRole,
  splitPortalAddressLabel,
  type PortalPermission,
} from "@/lib/customer-portal";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerTeamPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t, busy, inviteLink, inviteEmail, setInviteEmail, refresh, run, setInviteLink } = portal;
  const data = portal.data;
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, string[]>>({});
  const [profileDrafts, setProfileDrafts] = useState<Record<string, { department: string; deliveryPointId: string; canOrder: boolean }>>({});
  const [grants, setGrants] = useState<Record<PortalPermission, boolean> | null>(null);
  useEffect(() => {
    if (data?.role === "admin") setGrants(memberPermissionGrants(data));
  }, [data?.organization.id, data?.role, data?.memberPermissions]);
  if (!data) return null;
  const permissions = portalPermissions(data);
  if (!permissions.members && !permissions.menus && !permissions.settings) return <Navigate to="/customer" replace />;
  const invitations = data.invitations ?? [];
  const orgMenus = data.org_menus ?? [];

  function menuIdsFor(member: NonNullable<typeof data>["members"][number]) {
    return scopeDrafts[member.user_id] ?? member.menu_ids ?? [];
  }

  function toggleMenu(userId: string, menuId: string, current: string[]) {
    const next = current.includes(menuId)
      ? current.filter(id => id !== menuId)
      : [...current, menuId];
    setScopeDrafts(draft => ({ ...draft, [userId]: next }));
  }

  type TeamMember = NonNullable<typeof data>["members"][number];
  function profileFor(member: TeamMember) {
    return profileDrafts[member.user_id] ?? {
      department: member.department ?? "",
      deliveryPointId: member.delivery_point_id ?? "",
      canOrder: member.can_order ?? true,
    };
  }
  function updateProfile(member: TeamMember, patch: Partial<{ department: string; deliveryPointId: string; canOrder: boolean }>) {
    const current = profileFor(member);
    setProfileDrafts(draft => ({ ...draft, [member.user_id]: { ...current, ...patch } }));
  }

  return (
    <section className="personal-profile">
      <h1>{t("portal.team")}</h1>
      {data.role === "admin" && grants ? (
        <div className="portal-menu-scopes">
          <h2>{t("portal.memberPermissions")}</h2>
          <p>{t("portal.memberPermissionsHint")}</p>
          {portalPermissionKeys.map(key => (
            <label key={key} className="portal-menu-scope-option">
              <input
                type="checkbox"
                checked={grants[key]}
                disabled={busy}
                onChange={() => void run(async () => {
                  const allowed = !grants[key];
                  const saved = await setPortalMemberPermission(key, allowed, data.organization.id);
                  setGrants(memberPermissionGrants({ memberPermissions: saved }));
                  await refresh();
                }, t("portal.permissionsSaved"))}
              />
              <span>{t(`portal.permissions.${key}`)}</span>
            </label>
          ))}
        </div>
      ) : null}
      {permissions.members || permissions.menus ? <h2>{t("portal.members")}</h2> : null}
      {permissions.members || permissions.menus ? data.members.map(member => {
        const selected = menuIdsFor(member);
        const unrestricted = selected.length === 0;
        return (
          <div className="portal-row portal-team-member" key={member.user_id}>
            <div>
              <strong>{member.email}</strong>
              <p>{t(`portal.roles.${member.role}`)} · {member.is_active ? t("portal.active") : t("portal.inactive")}</p>
              {permissions.menus && member.is_active && member.role === "member" ? (
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
                      <span>{menu.brand} · {menu.name} · {formatMenuPeriod(menu)}</span>
                    </label>
                  ))}
                  <p className="portal-muted">{unrestricted ? t("portal.menuScopesAll") : t("portal.menuScopesSelected", { count: selected.length })}</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await setPortalMemberMenuScopes(member.user_id, selected, data.organization.id);
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
              {permissions.members && member.is_active && member.role === "member" ? (() => {
                const draft = profileFor(member);
                return (
                  <div className="portal-menu-scopes">
                    <label>{t("portal.memberDepartment")}
                      <input value={draft.department} disabled={busy} onChange={e => updateProfile(member, { department: e.target.value })} />
                    </label>
                    <label>{t("portal.memberDeliveryPoint")}
                      <select value={draft.deliveryPointId} disabled={busy} onChange={e => updateProfile(member, { deliveryPointId: e.target.value })}>
                        <option value="">{t("portal.memberNone")}</option>
                        {data.addresses.map(address => {
                          if (!address.delivery_points.length) return null;
                          const parsed = splitPortalAddressLabel(address.label);
                          const title = parsed.place || (parsed.kind ? t(`portal.addressKinds.${parsed.kind}`) : address.label);
                          return <optgroup key={address.id} label={title}>
                            {address.delivery_points.map(point => <option key={point.id} value={point.id}>{point.name}</option>)}
                          </optgroup>;
                        })}
                      </select>
                    </label>
                    <label className="portal-menu-scope-option">
                      <input type="checkbox" checked={draft.canOrder} disabled={busy} onChange={() => updateProfile(member, { canOrder: !draft.canOrder })} />
                      <span>{t("portal.memberCanOrder")}</span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(async () => {
                        await setPortalMemberProfile(member.user_id, {
                          department: draft.department.trim() || null,
                          deliveryPointId: draft.deliveryPointId || null,
                          canOrder: draft.canOrder,
                        }, data.organization.id);
                        setProfileDrafts(draftMap => {
                          const next = { ...draftMap };
                          delete next[member.user_id];
                          return next;
                        });
                        await refresh();
                      }, t("portal.memberProfileSaved"))}
                    >
                      {t("portal.saveMemberProfile")}
                    </Button>
                  </div>
                );
              })() : null}
            </div>
            <div className="portal-actions">
              {data.role === "admin" && member.is_active && member.role === "member" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await setPortalMemberRole(member.user_id, "admin", data.organization.id);
                    await refresh();
                  }, t("portal.roleUpdated"))}
                >
                  {t("portal.promoteAdmin")}
                </Button>
              ) : null}
              {data.role === "admin" && member.is_active && member.role === "admin" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await setPortalMemberRole(member.user_id, "member", data.organization.id);
                    await refresh();
                  }, t("portal.roleUpdated"))}
                >
                  {t("portal.demoteMember")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy || !member.is_active || !permissions.members}
                onClick={() => void run(async () => {
                  await removePortalMember(member.user_id, data.organization.id);
                  await refresh();
                }, t("portal.saved"))}
              >
                {t("portal.remove")}
              </Button>
            </div>
          </div>
        );
      }) : null}

      {permissions.members ? <h2>{t("portal.pendingInvites")}</h2> : null}
      {permissions.members && invitations.length === 0 ? <p>{t("portal.noPendingInvites")}</p> : null}
      {permissions.members ? invitations.map(invite => (
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
              await revokePortalInvitation(invite.id, data.organization.id);
              await refresh();
            }, t("portal.inviteRevoked"))}
          >
            {t("portal.revokeInvite")}
          </Button>
        </div>
      )) : null}

      {permissions.members ? <>
      <h2>{t("portal.createInvite")}</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          void run(async () => {
            const token = await invitePortalMember(inviteEmail, data.organization.id);
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
      </> : null}
    </section>
  );
}
