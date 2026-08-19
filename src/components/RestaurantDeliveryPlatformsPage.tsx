import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";

type Platform = {
  id: string;
  sortOrder: number;
  name: string;
  isActive: boolean;
};

export function RestaurantDeliveryPlatformsPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess(
    "restaurant.settings.delivery_platforms.edit",
  );
  const canDelete = access.canAccess(
    "restaurant.settings.delivery_platforms.delete",
  );
  const [rows, setRows] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [sortOrder, setSortOrder] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    void supabase
      .from("restaurant_delivery_platforms")
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
  const edit = (row: Platform | null) => {
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
    const now = new Date().toISOString();
    const fields = {
      sort_order: Number(sortOrder) || 0,
      name: name.trim(),
      is_active: active,
      bubble_modified_at: now,
    };
    if (editing)
      await supabase
        .from("restaurant_delivery_platforms")
        .update(fields)
        .eq("id", editing.id);
    else
      await supabase
        .from("restaurant_delivery_platforms")
        .insert({
          legacy_id: `web-restaurant-delivery-platform-${crypto.randomUUID()}`,
          bubble_created_at: now,
          ...fields,
        });
    close();
    load();
    setSaving(false);
  };
  const toggle = async (row: Platform) => {
    await supabase
      .from("restaurant_delivery_platforms")
      .update({
        is_active: !row.isActive,
        bubble_modified_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    load();
  };
  const remove = async (row: Platform) => {
    if (
      !window.confirm(
        t("restaurantDeliveryPlatforms.deleteConfirm", { name: row.name }),
      )
    )
      return;
    await supabase
      .from("restaurant_delivery_platforms")
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
          <h1>{t("restaurantDeliveryPlatforms.title")}</h1>
          <p>{t("restaurantDeliveryPlatforms.description")}</p>
        </div>
        {canEdit ? (
          <Button onClick={() => edit(null)}>
            <Plus />
            {t("restaurantDeliveryPlatforms.add")}
          </Button>
        ) : null}
      </header>
      <article className="panel ingredients-panel">
        <RestaurantSettingsListTable
          className="ingredients-table-wrap"
          loading={loading}
          loadingLabel={t("restaurantDeliveryPlatforms.loading")}
          skeletonColumns={canEdit || canDelete ? 4 : 3}
          header={
            <tr>
              <th>{t("restaurantDeliveryPlatforms.columns.order")}</th>
              <th>{t("restaurantDeliveryPlatforms.columns.name")}</th>
              <th>{t("restaurantDeliveryPlatforms.columns.status")}</th>
              {canEdit || canDelete ? (
                <th
                  aria-label={t("restaurantDeliveryPlatforms.columns.actions")}
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
                        ? t("restaurantDeliveryPlatforms.active")
                        : t("restaurantDeliveryPlatforms.inactive")
                    }
                  />
                ) : row.isActive ? (
                  t("restaurantDeliveryPlatforms.active")
                ) : (
                  t("restaurantDeliveryPlatforms.inactive")
                )}
              </td>
              {canEdit || canDelete ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    {canEdit ? (
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("restaurantDeliveryPlatforms.edit")}
                        onClick={() => edit(row)}
                      >
                        <Pencil />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label={t("restaurantDeliveryPlatforms.delete")}
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
            ? "restaurantDeliveryPlatforms.editTitle"
            : "restaurantDeliveryPlatforms.addTitle",
        )}
        onClose={close}
        closeLabel={t("restaurantDeliveryPlatforms.close")}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              {t("restaurantDeliveryPlatforms.cancel")}
            </Button>
            <Button
              type="submit"
              form="restaurant-delivery-platform-form"
              disabled={saving}
            >
              {saving
                ? t("restaurantDeliveryPlatforms.saving")
                : t("restaurantDeliveryPlatforms.save")}
            </Button>
          </>
        }
      >
        <form
          id="restaurant-delivery-platform-form"
          className="ingredients-form"
          onSubmit={(event) => void submit(event)}
        >
          <label className="ingredients-field">
            <span>{t("restaurantDeliveryPlatforms.fields.order")}</span>
            <input
              type="number"
              min="0"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantDeliveryPlatforms.fields.name")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t(
                "restaurantDeliveryPlatforms.fields.namePlaceholder",
              )}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantDeliveryPlatforms.fields.status")}</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </form>
      </SidePanel>
    </section>
  );
}
