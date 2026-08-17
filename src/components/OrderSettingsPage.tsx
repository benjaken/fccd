import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Tags, Trash2 } from "lucide-react";
import { Navigate, NavLink, useParams } from "react-router-dom";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { OrderPaymentMethodsTable } from "@/components/OrderPaymentMethodsTable";
import { OrderShippingMethodsTable } from "@/components/OrderShippingMethodsTable";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  archiveOrderTag,
  createOrderTag,
  fetchOrderTags,
  setOrderTagActive,
  type OrderTag,
} from "@/lib/order-tags";
import {
  createPaymentMethod,
  fetchPaymentMethods,
  updatePaymentMethod,
} from "@/lib/payment-methods";
import {
  createShippingMethod,
  fetchShippingMethods,
  updateShippingMethod,
} from "@/lib/shipping-methods";
import { cn } from "@/lib/utils";

const ORDER_SETTINGS_TABS = [
  "statuses",
  "tags",
  "stations",
  "shipping",
  "payments",
] as const;

type OrderSettingsTab = (typeof ORDER_SETTINGS_TABS)[number];

type TagsLoader = () => Promise<OrderTag[]>;
type TagCreator = typeof createOrderTag;
type TagActiveSaver = typeof setOrderTagActive;
type TagDeleter = typeof archiveOrderTag;

const TAG_SKELETON_COLUMNS = [
  { width: "70%" },
  { width: "4.5rem" },
];
const TAG_ACTION_SKELETON = { width: "2.5rem", variant: "action" as const };

function isOrderSettingsTab(value: string | undefined): value is OrderSettingsTab {
  return ORDER_SETTINGS_TABS.includes(value as OrderSettingsTab);
}

function CreateOrderTagPanel({
  open,
  onClose,
  onCreated,
  createTag,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (tag: OrderTag) => void;
  createTag: TagCreator;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeAndReset = () => {
    setName("");
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("name_required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createTag(name);
      setName("");
      onCreated(created);
      onClose();
    } catch {
      setError("create_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("orderSettings.tags.createTitle")}
      onClose={closeAndReset}
      closeLabel={t("orderSettings.closePanel")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("orderSettings.cancel")}
          </Button>
          <Button
            type="submit"
            form="create-order-tag-form"
            disabled={submitting}
          >
            {submitting
              ? t("orderSettings.tags.creating")
              : t("orderSettings.tags.createAction")}
          </Button>
        </>
      }
    >
      <form
        id="create-order-tag-form"
        className="order-settings-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="order-settings-field">
          <span>{t("orderSettings.tags.fields.name")}</span>
          <input
            value={name}
            autoComplete="off"
            placeholder={t("orderSettings.tags.fields.namePlaceholder")}
            aria-label={t("orderSettings.tags.fields.name")}
            aria-invalid={Boolean(error)}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error ? (
          <p className="list-inline-error" role="alert">
            {t(`orderSettings.tags.errors.${error}`, {
              defaultValue: t("orderSettings.tags.createError"),
            })}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

function OrderTagsTable({
  loadTags,
  createTag,
  setTagActive,
  deleteTag,
  createOpen,
  onCreateOpenChange,
}: {
  loadTags: TagsLoader;
  createTag: TagCreator;
  setTagActive: TagActiveSaver;
  deleteTag: TagDeleter;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings");
  const [rows, setRows] = useState<OrderTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadTags()
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) {
          setError("load_failed");
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTags, reloadKey]);

  const handleToggle = useEffectEvent(async (row: OrderTag, next: boolean) => {
    if (!canManage || togglingId || deletingId) return;
    setTogglingId(row.id);
    setActionError(null);
    const previous = rows;
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, isActive: next } : item,
      ),
    );
    try {
      const updated = await setTagActive(row.id, next);
      setRows((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      setRows(previous);
      setActionError(t("orderSettings.tags.toggleError"));
    } finally {
      setTogglingId(null);
    }
  });

  const handleDelete = useEffectEvent(async (row: OrderTag) => {
    if (!canManage || deletingId || togglingId) return;
    const confirmed = window.confirm(
      t("orderSettings.tags.deleteConfirm", { name: row.name }),
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteTag(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch {
      setActionError(t("orderSettings.tags.deleteError"));
    } finally {
      setDeletingId(null);
    }
  });

  return (
    <>
      {actionError ? (
        <p className="list-inline-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {error ? (
        <div className="orders-state orders-state-error" role="alert">
          <Tags />
          <div>
            <strong>{t("orderSettings.tags.loadError")}</strong>
            <span>{t("orderSettings.tags.loadErrorDescription")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("orderSettings.retry")}
          </Button>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="orders-state">
          <Tags />
          <div>
            <strong>{t("orderSettings.tags.empty")}</strong>
            <span>{t("orderSettings.tags.emptyDescription")}</span>
          </div>
          {canManage ? (
            <Button type="button" onClick={() => onCreateOpenChange(true)}>
              <Plus />
              {t("orderSettings.tags.add")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ListTable
          className="order-settings-table-wrap"
          onRefresh={() => setReloadKey((key) => key + 1)}
          loading={loading}
          loadingLabel={t("orderSettings.tags.loading")}
          skeletonRows={12}
          skeletonColumns={
            canManage
              ? [...TAG_SKELETON_COLUMNS, TAG_ACTION_SKELETON]
              : TAG_SKELETON_COLUMNS
          }
          header={
            <tr>
              <th>{t("orderSettings.tags.columns.name")}</th>
              <th className="order-settings-active-col">
                {t("orderSettings.active")}
              </th>
              {canManage ? (
                <th aria-label={t("orderSettings.tags.columns.actions")} />
              ) : null}
            </tr>
          }
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td className="order-settings-active-col">
                <Switch
                  checked={row.isActive}
                  disabled={
                    !canManage || togglingId === row.id || deletingId === row.id
                  }
                  aria-label={t("orderSettings.tags.toggleActive", {
                    name: row.name,
                  })}
                  onCheckedChange={(checked) => {
                    void handleToggle(row, checked);
                  }}
                />
              </td>
              {canManage ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={deletingId === row.id}
                      aria-label={t("orderSettings.tags.delete", {
                        name: row.name,
                      })}
                      title={t("orderSettings.tags.delete", { name: row.name })}
                      onClick={() => {
                        void handleDelete(row);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </ListTable>
      )}

      <CreateOrderTagPanel
        open={createOpen}
        onClose={() => onCreateOpenChange(false)}
        createTag={createTag}
        onCreated={(tag) => {
          setRows((current) =>
            [...current, tag].sort((left, right) =>
              left.name.localeCompare(right.name, "zh-Hant"),
            ),
          );
        }}
      />
    </>
  );
}

export function OrderSettingsPage({
  loadTags = fetchOrderTags,
  createTag = createOrderTag,
  setTagActive = setOrderTagActive,
  deleteTag = archiveOrderTag,
  loadMethods = fetchShippingMethods,
  createMethod = createShippingMethod,
  updateMethod = updateShippingMethod,
  loadPaymentMethods = fetchPaymentMethods,
  createPayment = createPaymentMethod,
  updatePayment = updatePaymentMethod,
}: {
  loadTags?: TagsLoader;
  createTag?: TagCreator;
  setTagActive?: TagActiveSaver;
  deleteTag?: TagDeleter;
  loadMethods?: typeof fetchShippingMethods;
  createMethod?: typeof createShippingMethod;
  updateMethod?: typeof updateShippingMethod;
  loadPaymentMethods?: typeof fetchPaymentMethods;
  createPayment?: typeof createPaymentMethod;
  updatePayment?: typeof updatePaymentMethod;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canManage = pageAccess.canManage("orders.settings");
  const { tab } = useParams();
  const activeTab = isOrderSettingsTab(tab) ? tab : null;
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setCreateOpen(false);
  }, [activeTab]);

  if (!activeTab) {
    return <Navigate to="/orders/settings/tags" replace />;
  }

  return (
    <section className="order-settings-page">
      <header className="page-heading order-settings-heading">
        <div>
          <span className="eyebrow">{t("orderSettings.eyebrow")}</span>
          <h1>{t("orderSettings.title")}</h1>
        </div>
        {(activeTab === "tags" ||
          activeTab === "shipping" ||
          activeTab === "payments") &&
        canManage ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {activeTab === "payments"
              ? t("orderSettings.payments.add")
              : activeTab === "shipping"
                ? t("orderSettings.shipping.add")
                : t("orderSettings.tags.add")}
          </Button>
        ) : null}
      </header>

      <nav className="order-settings-tabs" aria-label={t("orderSettings.tabsNav")}>
        {ORDER_SETTINGS_TABS.map((item) => (
          <NavLink
            key={item}
            to={`/orders/settings/${item}`}
            className={({ isActive }) => cn(isActive && "active")}
          >
            {t(`orderSettings.tabs.${item}`)}
          </NavLink>
        ))}
      </nav>

      <article className="panel order-settings-panel">
        {activeTab === "tags" ? (
          <OrderTagsTable
            loadTags={loadTags}
            createTag={createTag}
            setTagActive={setTagActive}
            deleteTag={deleteTag}
            createOpen={createOpen}
            onCreateOpenChange={setCreateOpen}
          />
        ) : activeTab === "shipping" ? (
          <OrderShippingMethodsTable
            loadMethods={loadMethods}
            createMethod={createMethod}
            updateMethod={updateMethod}
            createOpen={createOpen}
            onCreateOpenChange={setCreateOpen}
          />
        ) : activeTab === "payments" ? (
          <OrderPaymentMethodsTable
            loadMethods={loadPaymentMethods}
            createMethod={createPayment}
            updateMethod={updatePayment}
            createOpen={createOpen}
            onCreateOpenChange={setCreateOpen}
          />
        ) : (
          <div className="orders-state">
            <Tags />
            <div>
              <strong>{t("orderSettings.comingSoon")}</strong>
              <span>{t("orderSettings.comingSoonDescription")}</span>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
