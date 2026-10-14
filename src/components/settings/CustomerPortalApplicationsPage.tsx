import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import "@/components/customer-portal.css";
import { supabase } from "@/lib/supabase";
import { listPortalOpsOrgs, type OpsOrgListItem } from "@/lib/customer-portal-ops";
import {
  getBrExpiryPolicy,
  getOrganizationApplication,
  fetchOrganizationApplicationPage,
  openBrDocument,
  publishBrExpiryPolicy,
  renewOrganizationBr,
  reviewOrganizationApplication,
  uploadStaffBr,
  type ApplicationStatus,
  type BrExpiryPolicy,
  type OrganizationApplicationDetail,
  type OrganizationApplicationSummary,
  type SettlementCycle,
} from "@/lib/customer-portal-applications-ops";

function errorKey(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? "");
  if (message.includes("page_access_required")) return "portalApplications.accessDenied";
  if (message.includes("user_not_found")) return "portalApplications.userNotFound";
  if (message.includes("membership_conflict")) return "portalApplications.membershipConflict";
  if (message.includes("invalid_email")) return "portalApplications.invalidEmail";
  if (message.includes("invalid_settlement_cycle")) return "portalApplications.invalidCycle";
  if (message.includes("invalid_br_policy")) return "portalApplications.invalidPolicy";
  if (message.includes("invalid_br")) return "portalApplications.invalidBr";
  if (message.includes("application_not_pending")) return "portalApplications.notPending";
  return "portalApplications.operationFailed";
}

export function CustomerPortalApplicationsPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("settings.customer_portal.edit");
  const [rows, setRows] = useState<OrganizationApplicationSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [orgs, setOrgs] = useState<OpsOrgListItem[]>([]);
  const [policy, setPolicy] = useState<BrExpiryPolicy | null>(null);
  const [detail, setDetail] = useState<OrganizationApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [cycle, setCycle] = useState<SettlementCycle>("monthly");
  const [adminEmail, setAdminEmail] = useState("");
  const [reminderDays, setReminderDays] = useState("");
  const [blockOrders, setBlockOrders] = useState(false);
  const [policyReason, setPolicyReason] = useState("");
  const [renewOrgId, setRenewOrgId] = useState("");
  const [renewBr, setRenewBr] = useState("");
  const [renewExpires, setRenewExpires] = useState("");
  const [renewReason, setRenewReason] = useState("");
  const [renewFile, setRenewFile] = useState<File | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [applications, published, organizations] = await Promise.all([
        fetchOrganizationApplicationPage(page),
        getBrExpiryPolicy(),
        listPortalOpsOrgs(),
      ]);
      setRows(applications.rows);
      setTotal(applications.total);
      setPage(applications.page);
      setPolicy(published);
      setOrgs(organizations);
      setRenewOrgId(current => current || organizations[0]?.id || "");
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setLoading(false);
    }
  }, [t, page]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<void>, successKey: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(t(successKey));
      await load();
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setError("");
    setReason("");
    setAdminEmail("");
    try {
      setDetail(await getOrganizationApplication(id));
    } catch (err) {
      setError(t(errorKey(err)));
    }
  }

  async function review(event: FormEvent, decision: "needs_info" | "rejected" | "approved") {
    event.preventDefault();
    if (!detail) return;
    await run(async () => {
      await reviewOrganizationApplication({
        id: detail.id,
        decision,
        reason,
        settlementCycle: decision === "approved" ? cycle : null,
        adminEmail: decision === "approved" ? adminEmail : null,
      });
      setDetail(null);
    }, "portalApplications.reviewed");
  }

  async function publishPolicy(event: FormEvent) {
    event.preventDefault();
    const days = Number(reminderDays);
    await run(async () => {
      await publishBrExpiryPolicy({ reminderLeadDays: days, blockNewOrders: blockOrders, reason: policyReason });
      setPolicyReason("");
      setPolicyOpen(false);
    }, "portalApplications.policyPublished");
  }

  async function renew(event: FormEvent) {
    event.preventDefault();
    if (!renewFile) {
      setError(t("portalApplications.invalidBr"));
      return;
    }
    await run(async () => {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user.id;
      if (!userId) throw new Error("page_access_required");
      const path = await uploadStaffBr(renewOrgId, userId, renewFile);
      await renewOrganizationBr({
        orgId: renewOrgId,
        brNumber: renewBr,
        expiresOn: renewExpires,
        objectPath: path,
        reason: renewReason,
      });
      setRenewFile(null);
      setRenewReason("");
      setRenewOpen(false);
    }, "portalApplications.renewed");
  }

  return (
    <section className="ingredients-page customer-portal-ops">
      <header className="page-heading ingredients-heading">
        <div>
          <h1>{t("navigation.customerPortalApplications")}</h1>
          <p>{t("portalApplications.description")}</p>
        </div>
        {canEdit ? (
          <div className="portal-ops-actions">
            <Button type="button" variant="outline" onClick={() => setRenewOpen(true)}>{t("portalApplications.renew")}</Button>
            <Button type="button" onClick={() => setPolicyOpen(true)}><Plus /> {t("portalApplications.publishPolicy")}</Button>
          </div>
        ) : null}
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <p role="status">
        {policy
          ? t("portalApplications.policyActive", { days: policy.reminder_lead_days, block: t(policy.block_new_orders_when_expired ? "portalApplications.blockYes" : "portalApplications.blockNo") })
          : t("portalApplications.policyUnpublished")}
        {" "}{t("portalApplications.reminderNotSent")}
      </p>
        <ListTable
          className="panel"
          loading={loading}
          loadingLabel={t("portalApplications.loading")}
          skeletonColumns={5}
          onRefresh={load}
          header={<tr>
              <th>{t("portalApplications.company")}</th>
              <th>{t("portalApplications.applicant")}</th>
              <th>{t("portalApplications.status")}</th>
              <th>{t("portalApplications.expiresOn")}</th>
              <th className="table-actions-cell">{t("orders.columns.actions")}</th>
            </tr>}
        >
            {!rows.length ? <tr><td colSpan={5}>{error ? <Button variant="outline" onClick={() => void load()}>{t("portal.retry")}</Button> : t("portalApplications.empty")}</td></tr> : null}
            {rows.map(row => (
              <tr key={row.id}>
                <td>{row.company_name}</td>
                <td>{row.applicant_email}</td>
                <td>{t(`portalApplications.statusValue.${row.status as ApplicationStatus}`)}</td>
                <td>{row.br_expires_on ?? "—"}</td>
                <td className="table-actions-cell"><Button type="button" variant="ghost" size="icon" aria-label={t("portalApplications.review")} title={t("portalApplications.review")} onClick={() => void open(row.id)}><Pencil /></Button></td>
              </tr>
            ))}
        </ListTable>
      <TablePagination
        summary={t("orders.pagination", { from: total ? (page - 1) * 15 + 1 : 0, to: Math.min(page * 15, total), total })}
        page={page} totalPages={Math.max(1, Math.ceil(total / 15))} loading={loading}
        onPrevious={() => setPage(current => Math.max(1, current - 1))}
        onNext={() => setPage(current => Math.min(Math.max(1, Math.ceil(total / 15)), current + 1))}
        onPageChange={setPage} previousLabel={t("orders.previous")} nextLabel={t("orders.next")}
        pageLabel={t("orders.pageOf")} jumpLabel={t("orders.jumpToPage")}
      />
      <SidePanel open={policyOpen} title={t("portalApplications.policyTitle")} onClose={() => setPolicyOpen(false)} closeLabel={t("portalApplications.close")}>
        <form className="portal-ops-form" onSubmit={event => void publishPolicy(event)}>
          <label>
            {t("portalApplications.reminderDays")}
            <input type="number" min={1} max={365} value={reminderDays} onChange={event => setReminderDays(event.target.value)} required />
          </label>
          <label className="portal-ops-switch">
            <span>{t("portalApplications.blockOrders")}</span>
            <Switch checked={blockOrders} onCheckedChange={setBlockOrders} />
          </label>
          <label>
            {t("portalApplications.reason")}
            <input value={policyReason} onChange={event => setPolicyReason(event.target.value)} required maxLength={500} />
          </label>
          <div className="portal-ops-actions">
            <Button type="submit" disabled={busy}>{t("portalApplications.publishPolicy")}</Button>
            <Button type="button" variant="outline" onClick={() => setPolicyOpen(false)}>{t("portalApplications.close")}</Button>
          </div>
        </form>
      </SidePanel>
      <SidePanel open={renewOpen} title={t("portalApplications.renewTitle")} onClose={() => setRenewOpen(false)} closeLabel={t("portalApplications.close")}>
        <form className="portal-ops-form" onSubmit={event => void renew(event)}>
          <label>
            {t("portalApplications.organization")}
            <select value={renewOrgId} onChange={event => setRenewOrgId(event.target.value)} required>
              <option value="">{t("portalApplications.chooseOrganization")}</option>
              {orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label>
            {t("portalApplications.brNumber")}
            <input value={renewBr} onChange={event => setRenewBr(event.target.value)} required pattern="[A-Za-z0-9-]{4,40}" />
          </label>
          <label>
            {t("portalApplications.expiresOn")}
            <input type="date" value={renewExpires} onChange={event => setRenewExpires(event.target.value)} required />
          </label>
          <label>
            {t("portalApplications.attachment")}
            <input type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" onChange={event => setRenewFile(event.target.files?.[0] ?? null)} required />
          </label>
          <label>
            {t("portalApplications.reason")}
            <input value={renewReason} onChange={event => setRenewReason(event.target.value)} required maxLength={500} />
          </label>
          <div className="portal-ops-actions">
            <Button type="submit" disabled={busy}>{t("portalApplications.renew")}</Button>
            <Button type="button" variant="outline" onClick={() => setRenewOpen(false)}>{t("portalApplications.close")}</Button>
          </div>
        </form>
      </SidePanel>
      <SidePanel open={Boolean(detail)} title={detail?.company_name ?? ""} onClose={() => setDetail(null)} closeLabel={t("portalApplications.close")}>
        {detail ? (
          <form className="portal-ops-form" onSubmit={event => void review(event, "approved")}>
            <dl className="portal-ops-definition">
              <dt>{t("portalApplications.status")}</dt>
              <dd>{t(`portalApplications.statusValue.${detail.status}`)}</dd>
              <dt>{t("portalApplications.applicant")}</dt>
              <dd>{detail.applicant_email}</dd>
              <dt>{t("portalApplications.brNumber")}</dt>
              <dd>{detail.br_number || "—"} · {detail.br_expires_on ?? "—"}</dd>
            </dl>
            {detail.br_object_path ? <Button type="button" variant="outline" onClick={() => void openBrDocument(detail.br_object_path!).catch(err => setError(t(errorKey(err))))}>{t("portalApplications.openAttachment")}</Button> : null}
            <ul>
              {detail.contacts.map(contact => <li key={`${contact.name}-${contact.phone}`}>{contact.is_primary ? t("portalApplications.primary") : ""} {contact.name} · {contact.title} · {contact.phone}</li>)}
            </ul>
            <ul>
              {detail.addresses.map(address => <li key={`${address.label}-${address.address}`}>{address.label} · {address.recipient} · {address.address}</li>)}
            </ul>
            {detail.review_reason ? <p>{detail.review_reason}</p> : null}
            {canEdit && detail.status === "pending_review" ? (
              <>
                <label>{t("portalApplications.reason")}<input value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} /></label>
                <label>{t("portalApplications.cycle")}
                  <select value={cycle} onChange={event => setCycle(event.target.value as SettlementCycle)}>
                    <option value="weekly">{t("portalApplications.cycleWeekly")}</option>
                    <option value="semi_monthly">{t("portalApplications.cycleSemiMonthly")}</option>
                    <option value="monthly">{t("portalApplications.cycleMonthly")}</option>
                  </select>
                </label>
                <label>{t("portalApplications.adminEmail")}<input type="email" value={adminEmail} onChange={event => setAdminEmail(event.target.value)} /></label>
                <div className="portal-ops-actions">
                  <Button type="submit" disabled={busy}>{t("portalApplications.approve")}</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={event => void review(event, "needs_info")}>{t("portalApplications.needsInfo")}</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={event => void review(event, "rejected")}>{t("portalApplications.reject")}</Button>
                </div>
              </>
            ) : null}
          </form>
        ) : null}
      </SidePanel>
    </section>
  );
}
