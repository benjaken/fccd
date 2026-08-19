import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";

type Restaurant = { id: string; name: string; isActive: boolean };

export function RestaurantSettingsPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("restaurant.settings.restaurants.edit");
  const canDelete = access.canAccess("restaurant.settings.restaurants.delete");
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    void supabase
      .from("restaurants")
      .select("id,name,is_active")
      .is("archived_at", null)
      .order("name")
      .then(
        ({ data }) => {
          setRows(
            (data ?? []).map((row) => ({
              id: row.id as string,
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
    setName("");
    setActive(true);
  };
  const edit = (row: Restaurant | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setActive(row?.isActive ?? true);
    setOpen(true);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const fields = {
      name: name.trim(),
      is_active: active,
      updated_at: new Date().toISOString(),
    };
    if (editing)
      await supabase.from("restaurants").update(fields).eq("id", editing.id);
    else
      await supabase
        .from("restaurants")
        .insert({
          legacy_id: `web-restaurant-${crypto.randomUUID()}`,
          ...fields,
        });
    close();
    load();
    setSaving(false);
  };
  const toggle = async (row: Restaurant) => {
    await supabase
      .from("restaurants")
      .update({
        is_active: !row.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    load();
  };
  const remove = async (row: Restaurant) => {
    if (
      !window.confirm(
        t("restaurantSettingsPage.deleteConfirm", { name: row.name }),
      )
    )
      return;
    await supabase
      .from("restaurants")
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    load();
  };
  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("navigation.restaurant")}</span>
          <h1>{t("restaurantSettingsPage.title")}</h1>
          <p>{t("restaurantSettingsPage.description")}</p>
        </div>
        {canEdit ? (
          <Button onClick={() => edit(null)}>
            <Plus />
            {t("restaurantSettingsPage.add")}
          </Button>
        ) : null}
      </header>
      <article className="panel ingredients-panel">
        <RestaurantSettingsListTable
          className="ingredients-table-wrap"
          loading={loading}
          loadingLabel={t("restaurantSettingsPage.loading")}
          skeletonColumns={canEdit || canDelete ? 3 : 2}
          header={
            <tr>
              <th>{t("restaurantSettingsPage.columns.name")}</th>
              <th>{t("restaurantSettingsPage.columns.status")}</th>
              {canEdit || canDelete ? (
                <th aria-label={t("restaurantSettingsPage.columns.actions")} />
              ) : null}
            </tr>
          }
        >
          {rows.map((row) => (
            <tr key={row.id}>
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
                        ? t("restaurantSettingsPage.active")
                        : t("restaurantSettingsPage.inactive")
                    }
                  />
                ) : row.isActive ? (
                  t("restaurantSettingsPage.active")
                ) : (
                  t("restaurantSettingsPage.inactive")
                )}
              </td>
              {canEdit || canDelete ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    {canEdit ? (
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("restaurantSettingsPage.edit")}
                        onClick={() => edit(row)}
                      >
                        <Pencil />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label={t("restaurantSettingsPage.delete")}
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
            ? "restaurantSettingsPage.editTitle"
            : "restaurantSettingsPage.addTitle",
        )}
        onClose={close}
        closeLabel={t("restaurantSettingsPage.close")}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              {t("restaurantSettingsPage.cancel")}
            </Button>
            <Button
              type="submit"
              form="restaurant-settings-form"
              disabled={saving}
            >
              {saving
                ? t("restaurantSettingsPage.saving")
                : t("restaurantSettingsPage.save")}
            </Button>
          </>
        }
      >
        <form
          id="restaurant-settings-form"
          className="ingredients-form"
          onSubmit={(event) => void submit(event)}
        >
          <label className="ingredients-field">
            <span>{t("restaurantSettingsPage.fields.name")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("restaurantSettingsPage.fields.namePlaceholder")}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantSettingsPage.fields.status")}</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </form>
      </SidePanel>
    </section>
  );
}
