import { TablePagination } from "@/components/ui/table-pagination";
import { FormEvent, useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Pencil, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { CornerNotice } from "@/components/ui/corner-notice";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { useDeferredFilter } from "@/lib/use-deferred-filter";
import "@/components/customer-portal.css";
import "./customer-br-applications.css";
import { supabase } from "@/lib/supabase";
import { listPortalOpsOrgs, upsertPortalOpsOrg, type OpsOrgListItem } from "@/lib/customer-portal-ops";
import {
  getBrExpiryPolicy,
  getOrganizationApplication,
  fetchOrganizationApplicationPage,
  listBrChanges,
  openBrDocument,
  publishBrExpiryPolicy,
  renewOrganizationBr,
  reviewBrChange,
  reviewOrganizationApplication,
  uploadStaffBr,
  type ApplicationStatus,
  type BrChangeRequest,
  type BrExpiryPolicy,
  type OrganizationApplicationDetail,
  type OrganizationApplicationSummary,
  type SettlementCycle,
} from "@/lib/customer-portal-applications-ops";

function acceptedBrFile(file: File) {
  return /\.(jpe?g|png|pdf)$/i.test(file.name) && file.size <= 10 * 1024 * 1024;
}

function BrAttachmentField({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(false);

  function accept(next: File | null) {
    const chosen = next && acceptedBrFile(next) ? next : null;
    setRejected(Boolean(next) && !chosen);
    const input = inputRef.current;
    if (input && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      if (chosen) transfer.items.add(chosen);
      input.files = transfer.files;
    }
    onChange(chosen);
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setOver(true);
  }

  return (
    <label className="portal-br-drop">
      <span>{t("portalApplications.attachment")}</span>
      <span
        className={over ? "portal-br-drop-target is-over" : "portal-br-drop-target"}
        data-rejected={rejected ? "" : undefined}
        onDragEnter={allowDrop}
        onDragOver={allowDrop}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <strong>{file ? file.name : t("portalApplications.attachmentDrop")}</strong>
        <small>{rejected ? t("portalApplications.attachmentRejected") : t("portalApplications.attachmentHint")}</small>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        required
        onChange={(event) => accept(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function errorKey(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? "");
  if (message.includes("page_access_required")) return "portalApplications.accessDenied";
  if (message.includes("user_not_found")) return "portalApplications.userNotFound";
  if (message.includes("membership_conflict")) return "portalApplications.membershipConflict";
  if (message.includes("invalid_email")) return "portalApplications.invalidEmail";
  if (message.includes("invalid_settlement_cycle")) return "portalApplications.invalidCycle";
  if (message.includes("invalid_organization")) return "portalApplications.invalidOrganization";
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
  const [brChanges, setBrChanges] = useState<BrChangeRequest[]>([]);
  const [brDetail, setBrDetail] = useState<BrChangeRequest | null>(null);
  const [brReason, setBrReason] = useState("");
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
  const [createName, setCreateName] = useState("");
  const [createBr, setCreateBr] = useState("");
  const [createExpires, setCreateExpires] = useState("");
  const [createReason, setCreateReason] = useState("");
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | ApplicationStatus>("");
  const statusFilter = useDeferredFilter(status, (value: "" | ApplicationStatus) => {
    setPage(1);
    setStatus(value);
  });
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [published, organizations, changes] = await Promise.all([
        getBrExpiryPolicy(),
        listPortalOpsOrgs(),
        listBrChanges(),
      ]);
      if (search || status) {
        const first = await fetchOrganizationApplicationPage(1);
        const pageCount = Math.max(1, Math.ceil(first.total / pageSize));
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => fetchOrganizationApplicationPage(index + 2)),
        );
        const source = [first, ...rest].flatMap((result) => result.rows);
        const filtered = source.filter((row) => {
          const haystack = `${row.company_name} ${row.applicant_email}`.toLocaleLowerCase();
          return (!search || haystack.includes(search.toLocaleLowerCase())) && (!status || row.status === status);
        });
        const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
        const current = Math.min(page, lastPage);
        setRows(filtered.slice((current - 1) * pageSize, current * pageSize));
        setTotal(filtered.length);
        if (current !== page) setPage(current);
      } else {
        const applications = await fetchOrganizationApplicationPage(page);
        setRows(applications.rows);
        setTotal(applications.total);
        setPage(applications.page);
      }
      setPolicy(published);
      setOrgs(organizations);
      setBrChanges(Array.isArray(changes) ? changes : []);
      setRenewOrgId(current => current || organizations[0]?.id || "");
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status, t]);

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

  async function reviewChange(decision: "approved" | "rejected") {
    if (!brDetail) return;
    await run(async () => {
      await reviewBrChange({ id: brDetail.id, decision, reason: brReason });
      setBrDetail(null);
      setBrReason("");
    }, "portalApplications.brChangeReviewed");
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

  function openPolicy() {
    setReminderDays(policy ? String(policy.reminder_lead_days) : "");
    setBlockOrders(Boolean(policy?.block_new_orders_when_expired));
    setPolicyReason("");
    setPolicyOpen(true);
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

  async function createCompany(event: FormEvent) {
    event.preventDefault();
    const name = createName.trim();
    if (!createFile || name.length < 1) {
      setError(t("portalApplications.invalidBr"));
      return;
    }
    await run(async () => {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user.id;
      if (!userId) throw new Error("page_access_required");
      const orgId = await upsertPortalOpsOrg({ name, isActive: true });
      const path = await uploadStaffBr(orgId, userId, createFile);
      await renewOrganizationBr({
        orgId,
        brNumber: createBr,
        expiresOn: createExpires,
        objectPath: path,
        reason: createReason,
      });
      setCreateName("");
      setCreateBr("");
      setCreateExpires("");
      setCreateReason("");
      setCreateFile(null);
      setCreateOpen(false);
    }, "portalApplications.companyCreated");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visibleFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const visibleTo = Math.min(page * pageSize, total);
  const filteredEmpty = Boolean(search || status);
  return (
    <section className="orders-page customer-portal-ops customer-br-applications">
      <div className="portal-ops-list-intro">

        {notice ? <CornerNotice message={notice} onDismiss={() => setNotice("")} /> : null}
        <div className="portal-br-policy" aria-labelledby="br-policy-heading">
          <ShieldCheck className="br-policy-icon" aria-hidden="true" />
          <div>
            <h2 id="br-policy-heading">{t("portalApplications.policyTitle")}</h2>
            <p>
              {policy
                ? t("portalApplications.policyActive", { days: policy.reminder_lead_days, block: t(policy.block_new_orders_when_expired ? "portalApplications.blockYes" : "portalApplications.blockNo") })
                : t("portalApplications.policyUnpublished")}
            </p>
            <p className="br-policy-hint">{t("portalApplications.reminderNotSent")}</p>
          </div>
          {canEdit ? (
            <Button type="button" variant="outline" onClick={openPolicy}>
              <Pencil aria-hidden="true" />
              {policy ? t("portalApplications.editPolicy") : t("portalApplications.publishPolicy")}
            </Button>
          ) : null}
        </div>
        {brChanges.length ? (
          <div className="portal-br-policy" aria-labelledby="br-change-heading">
            <RefreshCw className="br-policy-icon" aria-hidden="true" />
            <div>
              <h2 id="br-change-heading">{t("portalApplications.brChangesTitle")}</h2>
              <p>{t("portalApplications.brChangesHint", { count: brChanges.length })}</p>
              <ul className="portal-br-change-list">
                {brChanges.map(change => (
                  <li key={change.id}>
                    <span>{change.orgName} · {change.brNumber} · {change.brExpiresOn}</span>
                    {canEdit ? <Button type="button" variant="outline" onClick={() => { setBrReason(""); setBrDetail(change); }}>{t("portalApplications.review")}</Button> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="customer-portal-application-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => {
              setPage(1);
              setSearch(draftSearch.trim());
            }}
            label={t("portalApplications.search")}
            placeholder={t("portalApplications.searchPlaceholder")}
            filtersActive={Boolean(status)}
            onConfirmFilters={statusFilter.confirm}
            onDismissFilters={statusFilter.revert}
            filters={
              <label className="orders-status-filter">
                <span>{t("portalApplications.statusFilter")}</span>
                <select
                  value={statusFilter.value}
                  onChange={(event) => statusFilter.setValue(event.target.value as "" | ApplicationStatus)}
                >
                  <option value="">{t("portalApplications.allStatuses")}</option>
                  {(["draft", "pending_review", "needs_info", "rejected", "approved"] as ApplicationStatus[]).map((value) => (
                    <option key={value} value={value}>{t(`portalApplications.statusValue.${value}`)}</option>
                  ))}
                </select>
              </label>
            }
            actions={canEdit ? (
              <>
                <Button type="button" onClick={() => setCreateOpen(true)}><Plus /> {t("portalApplications.createCompany")}</Button>
                <Button type="button" variant="outline" onClick={() => setRenewOpen(true)}><RefreshCw aria-hidden="true" />{t("portalApplications.renew")}</Button>
              </>
            ) : undefined}
          />
        </header>
        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <ClipboardList />
            <div><strong>{error}</strong></div>
            <Button variant="outline" onClick={() => void load()}><RefreshCw />{t("portal.retry")}</Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="orders-state br-applications-empty">
            <ClipboardList aria-hidden="true" />
            <div>
              <strong>{filteredEmpty ? t("portalApplications.noMatches") : t("portalApplications.empty")}</strong>
              <span>{filteredEmpty ? t("portalApplications.noMatchesDescription") : t("portalApplications.emptyDescription")}</span>
            </div>
            {canEdit && !filteredEmpty ? <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" />{t("portalApplications.createCompanyTitle")}</Button> : null}
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
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
        )}
        <TablePagination summary={t("settings.pagination", { from: visibleFrom, to: visibleTo, total })} page={page} totalPages={totalPages} loading={loading}
 onPrevious={() => setPage(Math.max(1, page - 1))} onNext={() => setPage(Math.min(totalPages, page + 1))}
 onPageChange={setPage} previousLabel={t("settings.previous")} nextLabel={t("settings.next")}
 pageLabel={t("orders.pageOf")} jumpLabel={t("orders.jumpToPage")} />
      </article>
      <SidePanel open={policyOpen} title={t("portalApplications.policyTitle")} description={t("portalApplications.reminderNotSent")} onClose={() => setPolicyOpen(false)} closeLabel={t("portalApplications.close")} footer={<><Button type="button" variant="outline" onClick={() => setPolicyOpen(false)}>{t("portalApplications.close")}</Button><Button type="submit" form="portal-policy-form" disabled={busy}>{t("portalApplications.publishPolicy")}</Button></>}>
        <form id="portal-policy-form" className="portal-ops-form" onSubmit={event => void publishPolicy(event)}>
          <label>
            {t("portalApplications.reminderDays")}
            <Input type="number" min={1} max={365} value={reminderDays} onChange={event => setReminderDays(event.target.value)} required />
          </label>
          <label className="portal-ops-switch">
            <span>{t("portalApplications.blockOrders")}</span>
            <Switch checked={blockOrders} onCheckedChange={setBlockOrders} />
          </label>
          <label>
            {t("portalApplications.reason")}
            <Input value={policyReason} onChange={event => setPolicyReason(event.target.value)} required maxLength={500} />
          </label>
        </form>
      </SidePanel>
      <SidePanel open={createOpen} title={t("portalApplications.createCompanyTitle")} onClose={() => setCreateOpen(false)} closeLabel={t("portalApplications.close")} footer={<><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("portalApplications.close")}</Button><Button type="submit" form="portal-create-company-form" disabled={busy}>{t("portalApplications.createCompany")}</Button></>}>
        <form id="portal-create-company-form" className="portal-ops-form" onSubmit={event => void createCompany(event)}>
          <label>
            {t("portalApplications.companyName")}
            <Input value={createName} onChange={event => setCreateName(event.target.value)} required maxLength={120} />
          </label>
          <label>
            {t("portalApplications.brNumber")}
            <Input value={createBr} onChange={event => setCreateBr(event.target.value)} required pattern="[A-Za-z0-9-]{4,40}" />
          </label>
          <label>
            {t("portalApplications.expiresOn")}
            <Input type="date" value={createExpires} onChange={event => setCreateExpires(event.target.value)} required />
          </label>
          <BrAttachmentField file={createFile} onChange={setCreateFile} />
          <label>
            {t("portalApplications.reason")}
            <Input value={createReason} onChange={event => setCreateReason(event.target.value)} required maxLength={500} />
          </label>
        </form>
      </SidePanel>
      <SidePanel open={renewOpen} title={t("portalApplications.renewTitle")} onClose={() => setRenewOpen(false)} closeLabel={t("portalApplications.close")} footer={<><Button type="button" variant="outline" onClick={() => setRenewOpen(false)}>{t("portalApplications.close")}</Button><Button type="submit" form="portal-renew-br-form" disabled={busy}>{t("portalApplications.renew")}</Button></>}>
        <form id="portal-renew-br-form" className="portal-ops-form" onSubmit={event => void renew(event)}>
          <label>
            {t("portalApplications.organization")}
            <select value={renewOrgId} onChange={event => setRenewOrgId(event.target.value)} required>
              <option value="">{t("portalApplications.chooseOrganization")}</option>
              {orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label>
            {t("portalApplications.brNumber")}
            <Input value={renewBr} onChange={event => setRenewBr(event.target.value)} required pattern="[A-Za-z0-9-]{4,40}" />
          </label>
          <label>
            {t("portalApplications.expiresOn")}
            <Input type="date" value={renewExpires} onChange={event => setRenewExpires(event.target.value)} required />
          </label>
          <BrAttachmentField file={renewFile} onChange={setRenewFile} />
          <label>
            {t("portalApplications.reason")}
            <Input value={renewReason} onChange={event => setRenewReason(event.target.value)} required maxLength={500} />
          </label>
        </form>
      </SidePanel>
      <SidePanel open={Boolean(detail)} title={detail?.company_name ?? ""} onClose={() => setDetail(null)} closeLabel={t("portalApplications.close")} footer={canEdit && detail?.status === "pending_review" ? <><Button type="button" variant="outline" disabled={busy} onClick={event => void review(event, "rejected")}>{t("portalApplications.reject")}</Button><Button type="button" variant="outline" disabled={busy} onClick={event => void review(event, "needs_info")}>{t("portalApplications.needsInfo")}</Button><Button type="submit" form="portal-application-review-form" disabled={busy}>{t("portalApplications.approve")}</Button></> : undefined}>
        {detail ? (
          <form id="portal-application-review-form" className="portal-ops-form" onSubmit={event => void review(event, "approved")}>
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
                <label>{t("portalApplications.reason")}<Input value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} /></label>
                <label>{t("portalApplications.cycle")}
                  <select value={cycle} onChange={event => setCycle(event.target.value as SettlementCycle)}>
                    <option value="weekly">{t("portalApplications.cycleWeekly")}</option>
                    <option value="semi_monthly">{t("portalApplications.cycleSemiMonthly")}</option>
                    <option value="monthly">{t("portalApplications.cycleMonthly")}</option>
                  </select>
                </label>
                <label>{t("portalApplications.adminEmail")}<Input type="email" value={adminEmail} onChange={event => setAdminEmail(event.target.value)} /></label>
              </>
            ) : null}
          </form>
        ) : null}
      </SidePanel>
      <SidePanel open={Boolean(brDetail)} title={brDetail?.orgName ?? ""} onClose={() => setBrDetail(null)} closeLabel={t("portalApplications.close")} footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void reviewChange("rejected")}>{t("portalApplications.reject")}</Button>
        <Button type="button" disabled={busy} onClick={() => void reviewChange("approved")}>{t("portalApplications.approveChange")}</Button>
      </>}>
        {brDetail ? (
          <div className="portal-ops-form">
            <dl className="portal-ops-definition">
              <dt>{t("portalApplications.currentBr")}</dt>
              <dd>{brDetail.currentBrNumber || "—"} · {brDetail.currentBrExpiresOn ?? "—"}</dd>
              <dt>{t("portalApplications.proposedBr")}</dt>
              <dd>{brDetail.brNumber} · {brDetail.brExpiresOn}</dd>
              <dt>{t("portalApplications.applicant")}</dt>
              <dd>{brDetail.submittedByEmail ?? "—"}</dd>
            </dl>
            <label>{t("portalApplications.reason")}<Input value={brReason} onChange={event => setBrReason(event.target.value)} required maxLength={500} /></label>
          </div>
        ) : null}
      </SidePanel>
    </section>
  );
}
