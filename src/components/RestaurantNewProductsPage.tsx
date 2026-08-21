import { Plus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";

type NewProduct = {
  id: string;
  name: string;
  remarksEnabled: boolean;
  remarksPlaceholder: string;
  isActive: boolean;
};

export function RestaurantNewProductsSettings() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("restaurant.settings.new_products.edit");
  const [rows, setRows] = useState<NewProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    void supabase
      .from("restaurant_new_products")
      .select("id,name,remarks_enabled,remarks_placeholder,is_active")
      .is("archived_at", null)
      .order("name")
      .then(
        ({ data }) => {
          setRows((data ?? []).map((row) => ({
            id: row.id as string,
            name: row.name as string,
            remarksEnabled: Boolean(row.remarks_enabled),
            remarksPlaceholder: (row.remarks_placeholder as string | null) ?? "",
            isActive: Boolean(row.is_active),
          })));
          setLoading(false);
        },
        () => setLoading(false),
      );
  }, []);

  useEffect(load, [load]);

  const closeAdd = () => {
    setAddOpen(false);
    setNewProductName("");
  };

  const addProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!newProductName.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    await supabase.from("restaurant_new_products").insert({
      legacy_id: `web-restaurant-new-product-${crypto.randomUUID()}`,
      name: newProductName.trim(),
      remarks_enabled: false,
      remarks_placeholder: null,
      is_active: true,
      bubble_created_at: now,
      bubble_modified_at: now,
    });
    setSaving(false);
    closeAdd();
    load();
  };

  const updateProduct = async (
    row: NewProduct,
    changes: Partial<Pick<NewProduct, "remarksEnabled" | "remarksPlaceholder" | "isActive">>,
  ) => {
    const next = { ...row, ...changes };
    setRows((current) => current.map((item) => item.id === row.id ? next : item));
    setSavingIds((current) => new Set(current).add(row.id));
    await supabase.from("restaurant_new_products").update({
      remarks_enabled: next.remarksEnabled,
      remarks_placeholder: next.remarksEnabled && next.remarksPlaceholder.trim()
        ? next.remarksPlaceholder.trim()
        : null,
      is_active: next.isActive,
      bubble_modified_at: new Date().toISOString(),
    }).eq("id", row.id);
    setSavingIds((current) => {
      const nextIds = new Set(current);
      nextIds.delete(row.id);
      return nextIds;
    });
  };

  return (
    <section className="restaurant-new-products-settings">
      <header className="restaurant-new-products-settings-toolbar">
        {canEdit ? (
          <Button onClick={() => setAddOpen(true)}>
            <Plus />
            {t("restaurantNewProducts.add")}
          </Button>
        ) : null}
      </header>

      <div className="restaurant-new-products-settings-table">
        <RestaurantSettingsListTable
          loading={loading}
          loadingLabel={t("restaurantNewProducts.loading")}
          skeletonColumns={4}
          onRefresh={load}
          header={
            <tr>
              <th>{t("restaurantNewProducts.columns.name")}</th>
              <th>{t("restaurantNewProducts.columns.remarks")}</th>
              <th>{t("restaurantNewProducts.columns.remarksPlaceholder")}</th>
              <th>{t("restaurantNewProducts.columns.status")}</th>
            </tr>
          }
        >
          {rows.map((row) => (
            <tr className={savingIds.has(row.id) ? "is-saving" : undefined} key={row.id}>
              <td><strong>{row.name}</strong></td>
              <td>
                {canEdit ? (
                  <Switch
                    checked={row.remarksEnabled}
                    onCheckedChange={(checked) => void updateProduct(row, { remarksEnabled: checked })}
                    aria-label={t("restaurantNewProducts.toggleRemarks", { name: row.name })}
                  />
                ) : row.remarksEnabled ? t("restaurantNewProducts.enabled") : t("restaurantNewProducts.disabled")}
              </td>
              <td>
                {canEdit ? (
                  <input
                    className="restaurant-new-products-remarks-input"
                    value={row.remarksPlaceholder}
                    disabled={!row.remarksEnabled}
                    aria-label={t("restaurantNewProducts.remarksPlaceholderFor", { name: row.name })}
                    placeholder={t("restaurantNewProducts.fields.remarksExamplePlaceholder")}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRows((current) => current.map((item) => item.id === row.id
                        ? { ...item, remarksPlaceholder: value }
                        : item));
                    }}
                    onBlur={(event) => void updateProduct(row, { remarksPlaceholder: event.target.value })}
                  />
                ) : row.remarksPlaceholder || "—"}
              </td>
              <td>
                {canEdit ? (
                  <Switch
                    checked={row.isActive}
                    onCheckedChange={(checked) => void updateProduct(row, { isActive: checked })}
                    aria-label={t("restaurantNewProducts.toggleStatus", { name: row.name })}
                  />
                ) : row.isActive ? t("restaurantNewProducts.active") : t("restaurantNewProducts.inactive")}
              </td>
            </tr>
          ))}
        </RestaurantSettingsListTable>
      </div>

      <Modal
        open={addOpen}
        title={t("restaurantNewProducts.addTitle")}
        onClose={closeAdd}
        closeLabel={t("restaurantNewProducts.close")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={closeAdd}>{t("restaurantNewProducts.cancel")}</Button>
            <Button type="submit" form="restaurant-new-product-add-form" disabled={saving || !newProductName.trim()}>
              {saving ? t("restaurantNewProducts.saving") : t("restaurantNewProducts.add")}
            </Button>
          </>
        }
      >
        <form id="restaurant-new-product-add-form" onSubmit={(event) => void addProduct(event)}>
          <label className="ingredients-field">
            <span>{t("restaurantNewProducts.fields.name")}</span>
            <input
              autoFocus
              required
              value={newProductName}
              onChange={(event) => setNewProductName(event.target.value)}
              placeholder={t("restaurantNewProducts.fields.namePlaceholder")}
            />
          </label>
        </form>
      </Modal>
    </section>
  );
}

export function RestaurantNewProductsPage() {
  const { t } = useTranslation();
  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("navigation.restaurant")}</span>
          <h1>{t("restaurantNewProducts.title")}</h1>
        </div>
      </header>
      <article className="panel ingredients-panel">
        <RestaurantNewProductsSettings />
      </article>
    </section>
  );
}
