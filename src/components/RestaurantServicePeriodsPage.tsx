import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";

type Period = {
  id: string;
  sortOrder: number;
  name: string;
  isActive: boolean;
};

export function RestaurantServicePeriodsPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("restaurant.settings.service_periods.edit");
  const canDelete = access.canAccess(
    "restaurant.settings.service_periods.delete",
  );
  const [rows, setRows] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [sortOrder, setSortOrder] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    void supabase
      .from("restaurant_service_periods")
      .select("id,sort_order,name,is_active")
      .is("archived_at", null)
      .order("sort_order")
      .order("name")
      .then(
        ({ data }) => {
          setRows(
            (data ?? []).map((row) => ({
              id: row.id as string,
              sortOrder: Number(row.sort_order ?? 0),
              name: row.name as string,
              isActive: Boolean(row.is_active),
            })),
          );
          setLoading(false);
        },
        () => setLoading(false),
      );
  };
  useEffect(load, []);
  const close = () => {
    setOpen(false);
    setEditing(null);
    setSortOrder("");
    setName("");
    setActive(true);
  };
  const edit = (row: Period | null) => {
    setEditing(row);
    setSortOrder(
      row?.sortOrder.toString() ??
        ((rows.at(-1)?.sortOrder ?? 0) + 1).toString(),
    );
    setName(row?.name ?? "");
    setActive(row?.isActive ?? true);
    setOpen(true);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const fields = {
      sort_order: Number(sortOrder) || 0,
      name: name.trim(),
      is_active: active,
      bubble_modified_at: new Date().toISOString(),
    };
    if (editing)
      await supabase
        .from("restaurant_service_periods")
        .update(fields)
        .eq("id", editing.id);
    else
      await supabase
        .from("restaurant_service_periods")
        .insert({
          legacy_id: `web-restaurant-service-period-${crypto.randomUUID()}`,
          bubble_created_at: new Date().toISOString(),
          ...fields,
        });
    close();
    load();
    setSaving(false);
  };
  const toggle = async (row: Period) => {
    await supabase
      .from("restaurant_service_periods")
      .update({
        is_active: !row.isActive,
        bubble_modified_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    load();
  };
  const remove = async (row: Period) => {
    if (
      !window.confirm(
        t("restaurantServicePeriods.deleteConfirm", { name: row.name }),
      )
    )
      return;
    await supabase
      .from("restaurant_service_periods")
      .update({
        archived_at: new Date().toISOString(),
        bubble_modified_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    load();
  };
  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("navigation.restaurant")}</span>
          <h1>{t("restaurantServicePeriods.title")}</h1>
          <p>{t("restaurantServicePeriods.description")}</p>
        </div>
        {canEdit ? (
          <Button onClick={() => edit(null)}>
            <Plus />
            {t("restaurantServicePeriods.add")}
          </Button>
        ) : null}
      </header>
      <article className="panel ingredients-panel">
        <RestaurantSettingsListTable
          className="ingredients-table-wrap"
          loading={loading}
          loadingLabel={t("restaurantServicePeriods.loading")}
          skeletonColumns={canEdit || canDelete ? 4 : 3}
          header={
            <tr>
              <th>{t("restaurantServicePeriods.columns.order")}</th>
              <th>{t("restaurantServicePeriods.columns.name")}</th>
              <th>{t("restaurantServicePeriods.columns.status")}</th>
              {canEdit || canDelete ? (
                <th
                  aria-label={t("restaurantServicePeriods.columns.actions")}
                />
              ) : null}
            </tr>
          }
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.sortOrder}</td>
              <td>
                <strong>{row.name}</strong>
              </td>
              <td>
                {canEdit ? (
                  <Switch
                    checked={row.isActive}
                    onCheckedChange={() => void toggle(row)}
                    aria-label={
                      row.isActive
                        ? t("restaurantServicePeriods.active")
                        : t("restaurantServicePeriods.inactive")
                    }
                  />
                ) : row.isActive ? (
                  t("restaurantServicePeriods.active")
                ) : (
                  t("restaurantServicePeriods.inactive")
                )}
              </td>
              {canEdit || canDelete ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    {canEdit ? (
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("restaurantServicePeriods.edit")}
                        onClick={() => edit(row)}
                      >
                        <Pencil />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label={t("restaurantServicePeriods.delete")}
                        onClick={() => void remove(row)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </RestaurantSettingsListTable>
      </article>
      <SidePanel
        open={open}
        title={t(
          editing
            ? "restaurantServicePeriods.editTitle"
            : "restaurantServicePeriods.addTitle",
        )}
        onClose={close}
        closeLabel={t("restaurantServicePeriods.close")}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              {t("restaurantServicePeriods.cancel")}
            </Button>
            <Button
              type="submit"
              form="restaurant-service-period-form"
              disabled={saving}
            >
              {saving
                ? t("restaurantServicePeriods.saving")
                : t("restaurantServicePeriods.save")}
            </Button>
          </>
        }
      >
        <form
          id="restaurant-service-period-form"
          className="ingredients-form"
          onSubmit={(event) => void submit(event)}
        >
          <label className="ingredients-field">
            <span>{t("restaurantServicePeriods.fields.order")}</span>
            <input
              type="number"
              min="0"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantServicePeriods.fields.name")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("restaurantServicePeriods.fields.namePlaceholder")}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantServicePeriods.fields.status")}</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </form>
      </SidePanel>
    </section>
  );
}
