import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, UserRoundCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  assignDeliveryTeamAndDriver,
  DRIVER_ASSIGNMENTS_PAGE_SIZE,
  fetchDeliveryAssignmentOptions,
  fetchUnassignedDriverDeliveries,
  type DeliveryDriverOption,
  type DeliveryTeamOption,
  type DriverAssignmentItem,
} from "@/lib/delivery-driver-assignment";
import { useDeferredFilter } from "@/lib/use-deferred-filter";

function display(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function AssignDriverPage() {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [teamFilterId, setTeamFilterId] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<DriverAssignmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [teams, setTeams] = useState<DeliveryTeamOption[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriverOption[]>([]);
  const [assignmentItem, setAssignmentItem] =
    useState<DriverAssignmentItem | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const teamFilter = useDeferredFilter(teamFilterId, (value) => {
    setPage(1);
    setTeamFilterId(value);
  });

  const totalPages = Math.max(
    1,
    Math.ceil(total / DRIVER_ASSIGNMENTS_PAGE_SIZE),
  );
  const visibleFrom =
    total === 0 ? 0 : (page - 1) * DRIVER_ASSIGNMENTS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * DRIVER_ASSIGNMENTS_PAGE_SIZE, total);
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchUnassignedDriverDeliveries({
        page,
        search,
        teamId: teamFilterId,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, reloadKey, search, teamFilterId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    void fetchDeliveryAssignmentOptions()
      .then((result) => {
        if (!active) return;
        setTeams(result.teams);
        setDrivers(result.drivers);
      })
      .catch(() => {
        if (!active) return;
        setTeams([]);
        setDrivers([]);
      })
      .finally(() => active && setLoadingOptions(false));
    return () => {
      active = false;
    };
  }, []);

  const openAssignment = (item: DriverAssignmentItem) => {
    setAssignmentItem(item);
    setSelectedTeamId(item.motorcadeId ?? "");
    setSelectedDriverId("");
    setAssignError(null);
  };

  const closeAssignment = () => {
    setAssignmentItem(null);
    setSelectedTeamId("");
    setSelectedDriverId("");
  };

  const assign = async () => {
    if (!assignmentItem || !selectedTeamId || !selectedDriverId) {
      setAssignError(t("assignDriverPage.selectionRequired"));
      return;
    }
    setAssigningId(assignmentItem.id);
    setAssignError(null);
    try {
      await assignDeliveryTeamAndDriver(
        assignmentItem.id,
        selectedTeamId,
        selectedDriverId,
      );
      closeAssignment();
      setReloadKey((value) => value + 1);
    } catch {
      setAssignError(t("assignDriverPage.assignError"));
    } finally {
      setAssigningId(null);
    }
  };

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  return (
    <section className="orders-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("assignDriverPage.eyebrow")}</span>
          <h1>{t("assignDriverPage.title")}</h1>
          <p>{t("assignDriverPage.description")}</p>
        </div>
      </header>
      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <ListSearchBar
            id="assign-driver-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("assignDriverPage.search")}
            placeholder={t("assignDriverPage.searchPlaceholder")}
            submitLabel={t("assignDriverPage.searchAction")}
            filtersActive={Boolean(teamFilterId)}
            onConfirmFilters={teamFilter.confirm}
            onDismissFilters={teamFilter.revert}
            filters={
              <label className="orders-status-filter">
                <span>{t("assignDriverPage.teamFilter")}</span>
                <select
                  value={teamFilter.value}
                  onChange={(event) => teamFilter.setValue(event.target.value)}
                >
                  <option value="">{t("assignDriverPage.allTeams")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </header>
        {assignError ? (
          <div className="list-inline-error" role="alert">
            {assignError}
          </div>
        ) : null}
        {error ? (
          <div className="orders-state">
            <UserRoundCheck />
            <div>
              <strong>{t("assignDriverPage.loadError")}</strong>
              <span>{t("assignDriverPage.loadErrorDescription")}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              <RefreshCw />
              {t("assignDriverPage.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <UserRoundCheck />
            <div>
              <strong>{t("assignDriverPage.empty")}</strong>
              <span>{t("assignDriverPage.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap"
            loading={loading}
            loadingLabel={t("assignDriverPage.loading")}
            skeletonRows={DRIVER_ASSIGNMENTS_PAGE_SIZE}
            skeletonColumns={7}
            onRefresh={() => setReloadKey((value) => value + 1)}
            header={
              <tr>
                <th>{t("assignDriverPage.columns.order")}</th>
                <th>{t("assignDriverPage.columns.customer")}</th>
                <th>{t("assignDriverPage.columns.delivery")}</th>
                <th>{t("assignDriverPage.columns.status")}</th>
                <th>{t("assignDriverPage.columns.team")}</th>
                <th>{t("assignDriverPage.columns.driver")}</th>
                <th aria-label={t("assignDriverPage.columns.actions")} />
              </tr>
            }
          >
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>
                    {display(item.orderNumber, t("common.notSet"))}
                  </strong>
                </td>
                <td>{display(item.customerName, t("common.notSet"))}</td>
                <td>
                  {item.deliveryAt ? (
                    <>
                      {date.format(new Date(item.deliveryAt))}
                      {item.deliveryTime ? (
                        <small className="order-delivery-time">
                          {item.deliveryTime}
                        </small>
                      ) : null}
                    </>
                  ) : (
                    display(item.deliveryTime, t("common.notSet"))
                  )}
                </td>
                <td>{display(item.deliveryStatus, t("common.notSet"))}</td>
                <td>{display(item.motorcadeName, t("common.notSet"))}</td>
                <td>{display(item.driverName, t("common.notSet"))}</td>
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      size="sm"
                      disabled={loadingOptions || assigningId === item.id}
                      onClick={() => openAssignment(item)}
                    >
                      {t("assignDriverPage.assign")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </ListTable>
        )}
        <TablePagination
          summary={t("assignDriverPage.pagination", {
            from: visibleFrom,
            to: visibleTo,
            total,
          })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
          onPageChange={setPage}
          previousLabel={t("assignDriverPage.previous")}
          nextLabel={t("assignDriverPage.next")}
          pageLabel={t("assignDriverPage.pageOf")}
          jumpLabel={t("assignDriverPage.jumpToPage")}
        />
      </article>
      <SidePanel
        open={Boolean(assignmentItem)}
        title={t("assignDriverPage.assignTitle", {
          order: display(assignmentItem?.orderNumber, t("common.notSet")),
        })}
        onClose={closeAssignment}
        closeLabel={t("assignDriverPage.close")}
        footer={
          <>
            <Button variant="outline" onClick={closeAssignment}>
              {t("assignDriverPage.cancel")}
            </Button>
            <Button
              type="submit"
              form="assign-driver-form"
              disabled={loadingOptions || Boolean(assigningId)}
            >
              {assigningId
                ? t("assignDriverPage.assigning")
                : t("assignDriverPage.assign")}
            </Button>
          </>
        }
      >
        <form
          id="assign-driver-form"
          className="ingredients-form"
          onSubmit={(event) => {
            event.preventDefault();
            void assign();
          }}
        >
          <label className="ingredients-field">
            <span>{t("assignDriverPage.columns.team")}</span>
            <select
              value={selectedTeamId}
              disabled={loadingOptions || Boolean(assigningId)}
              onChange={(event) => {
                setSelectedTeamId(event.target.value);
                setSelectedDriverId("");
              }}
            >
              <option value="">{t("assignDriverPage.selectTeam")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ingredients-field">
            <span>{t("assignDriverPage.columns.driver")}</span>
            <select
              value={selectedDriverId}
              disabled={
                !selectedTeamId || loadingOptions || Boolean(assigningId)
              }
              onChange={(event) => setSelectedDriverId(event.target.value)}
            >
              <option value="">{t("assignDriverPage.selectDriver")}</option>
              {drivers
                .filter((driver) => driver.teamId === selectedTeamId)
                .map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
            </select>
          </label>
        </form>
      </SidePanel>
    </section>
  );
}
