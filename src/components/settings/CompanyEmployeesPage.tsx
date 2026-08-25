import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MailPlus, RefreshCw, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  COMPANY_EMPLOYEE_PAGE_SIZE,
  fetchCompanyEmployees,
  inviteCompanyEmployee,
  type CompanyEmployee,
} from "@/lib/company-employees";

type EmployeeStatus = "active" | "inactive" | "all";

export function CompanyEmployeesPage({
  loadEmployees = fetchCompanyEmployees,
  inviteEmployee = inviteCompanyEmployee,
}: {
  loadEmployees?: typeof fetchCompanyEmployees;
  inviteEmployee?: typeof inviteCompanyEmployee;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("active");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CompanyEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / COMPANY_EMPLOYEE_PAGE_SIZE));
  const from = total ? (page - 1) * COMPANY_EMPLOYEE_PAGE_SIZE + 1 : 0;
  const to = Math.min(page * COMPANY_EMPLOYEE_PAGE_SIZE, total);
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadEmployees({ page, search, status });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loadEmployees, page, reloadKey, search, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  return (
    <section className="orders-page settings-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.employees.title")}</h1>
          <p>{t("settings.employees.description")}</p>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="settings-employees-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={() => {
              setPage(1);
              setSearch(draftSearch.trim());
            }}
            label={t("settings.employees.search")}
            placeholder={t("settings.employees.searchPlaceholder")}
            submitLabel={t("settings.employees.searchAction")}
            filters={
              <label className="orders-status-filter">
                <span>{t("settings.employees.statusFilter")}</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setPage(1);
                    setStatus(event.target.value as EmployeeStatus);
                  }}
                >
                  <option value="active">{t("settings.employees.active")}</option>
                  <option value="inactive">{t("settings.employees.inactive")}</option>
                  <option value="all">{t("settings.employees.allStatuses")}</option>
                </select>
              </label>
            }
          />
        </header>

        {error ? (
          <div className="orders-state orders-state-error" role="alert">
            <UsersRound />
            <div>
              <strong>{t("settings.employees.loadError")}</strong>
              <span>{t("settings.employees.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />
              {t("settings.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <UsersRound />
            <div>
              <strong>{t("settings.employees.empty")}</strong>
              <span>{t("settings.employees.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel={t("settings.employees.loading")}
            skeletonRows={COMPANY_EMPLOYEE_PAGE_SIZE}
            skeletonColumns={8}
            header={
              <tr>
                <th>{t("settings.employees.columns.name")}</th>
                <th>{t("settings.employees.columns.email")}</th>
                <th>{t("settings.employees.columns.phone")}</th>
                <th>{t("settings.employees.columns.company")}</th>
                <th>{t("settings.employees.columns.team")}</th>
                <th>{t("settings.employees.columns.position")}</th>
                <th>{t("settings.employees.columns.account")}</th>
                <th>{t("settings.employees.columns.synced")}</th>
                <th>{t("settings.employees.columns.actions")}</th>
              </tr>
            }
          >
            {items.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <strong>{employee.displayName || employee.chineseName || "—"}</strong>
                  {employee.displayName && employee.chineseName ? <small>{employee.chineseName}</small> : null}
                </td>
                <td>{employee.workEmail || employee.privateEmail || "—"}</td>
                <td>{employee.companyPhone || employee.privatePhone || "—"}</td>
                <td>{employee.company || "—"}</td>
                <td>{employee.teamName || "—"}</td>
                <td>{employee.position || "—"}</td>
                <td>
                  <span className={`status-badge ${employee.linkedUserId ? "green" : "neutral"}`}>
                    {employee.linkedUserId
                      ? t("settings.employees.accountLinked")
                      : t("settings.employees.accountNotLinked")}
                  </span>
                </td>
                <td>{date.format(new Date(employee.lastSyncedAt))}</td>
                <td>
                  {!employee.linkedUserId && (employee.workEmail || employee.privateEmail) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={invitingId === employee.id}
                      onClick={() => {
                        setInvitingId(employee.id);
                        setInviteMessage(null);
                        setInviteError(null);
                        void inviteEmployee(employee.id)
                          .then(() => {
                            setInviteMessage(t("settings.employees.inviteSent", {
                              email: employee.workEmail || employee.privateEmail,
                            }));
                            setReloadKey((key) => key + 1);
                          })
                          .catch((inviteFailure) => {
                            const code = inviteFailure instanceof Error
                              ? inviteFailure.message
                              : "invite_failed";
                            setInviteError(t(`settings.employees.errors.${code}`, {
                              defaultValue: t("settings.employees.errors.invite_failed"),
                            }));
                          })
                          .finally(() => setInvitingId(null));
                      }}
                    >
                      <MailPlus />
                      {invitingId === employee.id
                        ? t("settings.employees.inviting")
                        : t("settings.employees.invite")}
                    </Button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </ListTable>
        )}

        {inviteMessage ? <div className="auth-message auth-success" role="status">{inviteMessage}</div> : null}
        {inviteError ? <div className="auth-message auth-error" role="alert">{inviteError}</div> : null}

        <TablePagination
          summary={t("settings.pagination", { from, to, total })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
          onPageChange={setPage}
          previousLabel={t("settings.previous")}
          nextLabel={t("settings.next")}
          pageLabel="/"
          jumpLabel={t("settings.employees.jumpToPage")}
        />
      </article>
    </section>
  );
}
