import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { fetchSupplierOptions } from "@/lib/ingredients";
import { supabase } from "@/lib/supabase";

type InventoryItem = {
  id: string;
  legacyId: string;
  supplierId: string | null;
  supplierName: string | null;
  name: string;
  unit: string | null;
  costPerUnit: number | null;
  department: string | null;
  isActive: boolean;
};
const departments = ["廚房", "水吧"];
function related<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function RestaurantInventoryItemsPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("restaurant.settings.inventory_items.edit");
  const canDelete = access.canAccess(
    "restaurant.settings.inventory_items.delete",
  );
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");
  const [department, setDepartment] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    void supabase
      .from("restaurant_ingredients")
      .select(
        "id,legacy_id,supplier_id,name,unit,cost_per_unit,is_active,suppliers(id,company_name),restaurant_ingredient_departments(department_name)",
      )
      .is("archived_at", null)
      .order("name")
      .then(
        ({ data }) => {
          setRows(
            (data ?? []).map((row) => {
              const supplier = related(
                row.suppliers as
                  | { id: string; company_name: string | null }
                  | { id: string; company_name: string | null }[]
                  | null,
              );
              const itemDepartments =
                row.restaurant_ingredient_departments as Array<{
                  department_name: string;
                }> | null;
              return {
                id: row.id as string,
                legacyId: row.legacy_id as string,
                supplierId: row.supplier_id as string | null,
                supplierName: supplier?.company_name ?? null,
                name: row.name as string,
                unit: row.unit as string | null,
                costPerUnit:
                  row.cost_per_unit === null ? null : Number(row.cost_per_unit),
                department: itemDepartments?.[0]?.department_name ?? null,
                isActive: Boolean(row.is_active),
              };
            }),
          );
          setLoading(false);
        },
        () => setLoading(false),
      );
  };
  useEffect(() => {
    load();
    void fetchSupplierOptions().then(setSuppliers);
  }, []);
  const close = () => {
    setOpen(false);
    setEditing(null);
    setSupplierId("");
    setName("");
    setUnit("");
    setCost("");
    setDepartment("");
    setActive(true);
  };
  const edit = (row: InventoryItem | null) => {
    setEditing(row);
    setSupplierId(row?.supplierId ?? "");
    setName(row?.name ?? "");
    setUnit(row?.unit ?? "");
    setCost(row?.costPerUnit?.toString() ?? "");
    setDepartment(row?.department ?? "");
    setActive(row?.isActive ?? true);
    setOpen(true);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !department) return;
    setSaving(true);
    const fields = {
      supplier_id: supplierId || null,
      name: name.trim(),
      unit: unit.trim() || null,
      cost_per_unit: cost.trim() ? Number(cost) : null,
      is_active: active,
      updated_at: new Date().toISOString(),
    };
    let id = editing?.id;
    let legacyId = editing?.legacyId;
    if (editing)
      await supabase
        .from("restaurant_ingredients")
        .update(fields)
        .eq("id", editing.id);
    else {
      legacyId = `web-restaurant-inventory-${crypto.randomUUID()}`;
      const { data } = await supabase
        .from("restaurant_ingredients")
        .insert({ legacy_id: legacyId, ...fields })
        .select("id")
        .single();
      id = data?.id as string | undefined;
    }
    if (id && legacyId) {
      await supabase
        .from("restaurant_ingredient_departments")
        .delete()
        .eq("restaurant_ingredient_id", id);
      await supabase
        .from("restaurant_ingredient_departments")
        .insert({
          restaurant_ingredient_id: id,
          restaurant_ingredient_legacy_id: legacyId,
          department_name: department,
        });
    }
    close();
    load();
    setSaving(false);
  };
  const toggle = async (row: InventoryItem) => {
    await supabase
      .from("restaurant_ingredients")
      .update({
        is_active: !row.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    load();
  };
  const remove = async (row: InventoryItem) => {
    if (
      !window.confirm(
        t("restaurantInventoryItems.deleteConfirm", { name: row.name }),
      )
    )
      return;
    await supabase
      .from("restaurant_ingredients")
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
          <h1>{t("restaurantInventoryItems.title")}</h1>
          <p>{t("restaurantInventoryItems.description")}</p>
        </div>
        {canEdit ? (
          <Button onClick={() => edit(null)}>
            <Plus />
            {t("restaurantInventoryItems.add")}
          </Button>
        ) : null}
      </header>
      <article className="panel ingredients-panel">
        <RestaurantSettingsListTable
          className="ingredients-table-wrap"
          loading={loading}
          loadingLabel={t("restaurantInventoryItems.loading")}
          skeletonColumns={canEdit || canDelete ? 7 : 6}
          header={
            <tr>
              <th>{t("restaurantInventoryItems.columns.supplier")}</th>
              <th>{t("restaurantInventoryItems.columns.name")}</th>
              <th>{t("restaurantInventoryItems.columns.unit")}</th>
              <th>{t("restaurantInventoryItems.columns.cost")}</th>
              <th>{t("restaurantInventoryItems.columns.department")}</th>
              <th>{t("restaurantInventoryItems.columns.status")}</th>
              {canEdit || canDelete ? (
                <th
                  aria-label={t("restaurantInventoryItems.columns.actions")}
                />
              ) : null}
            </tr>
          }
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.supplierName || "—"}</td>
              <td>
                <strong>{row.name}</strong>
              </td>
              <td>{row.unit || "—"}</td>
              <td>
                {row.costPerUnit === null
                  ? "—"
                  : `${row.costPerUnit} / ${row.unit || "—"}`}
              </td>
              <td>{row.department || "—"}</td>
              <td>
                {canEdit ? (
                  <Switch
                    checked={row.isActive}
                    onCheckedChange={() => void toggle(row)}
                    aria-label={
                      row.isActive
                        ? t("restaurantInventoryItems.active")
                        : t("restaurantInventoryItems.inactive")
                    }
                  />
                ) : row.isActive ? (
                  t("restaurantInventoryItems.active")
                ) : (
                  t("restaurantInventoryItems.inactive")
                )}
              </td>
              {canEdit || canDelete ? (
                <td className="table-actions-cell">
                  <div className="table-row-actions">
                    {canEdit ? (
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("restaurantInventoryItems.edit")}
                        onClick={() => edit(row)}
                      >
                        <Pencil />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label={t("restaurantInventoryItems.delete")}
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
            ? "restaurantInventoryItems.editTitle"
            : "restaurantInventoryItems.addTitle",
        )}
        onClose={close}
        closeLabel={t("restaurantInventoryItems.close")}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              {t("restaurantInventoryItems.cancel")}
            </Button>
            <Button
              type="submit"
              form="restaurant-inventory-item-form"
              disabled={saving}
            >
              {saving
                ? t("restaurantInventoryItems.saving")
                : t("restaurantInventoryItems.save")}
            </Button>
          </>
        }
      >
        <form
          id="restaurant-inventory-item-form"
          className="ingredients-form"
          onSubmit={(event) => void submit(event)}
        >
          <label className="ingredients-field">
            <span>{t("restaurantInventoryItems.fields.supplier")}</span>
            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">
                {t("restaurantInventoryItems.fields.supplierPlaceholder")}
              </option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantInventoryItems.fields.name")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("restaurantInventoryItems.fields.namePlaceholder")}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantInventoryItems.fields.unit")}</span>
            <input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder={t("restaurantInventoryItems.fields.unitPlaceholder")}
            />
          </label>
          <label className="ingredients-field">
            <span>
              {t("restaurantInventoryItems.fields.cost")}
              {unit.trim() ? `／${unit.trim()}` : ""}
            </span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              placeholder={t("restaurantInventoryItems.fields.costPlaceholder")}
            />
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantInventoryItems.fields.department")}</span>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="">
                {t("restaurantInventoryItems.fields.departmentPlaceholder")}
              </option>
              {departments.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="ingredients-field">
            <span>{t("restaurantInventoryItems.fields.status")}</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </form>
      </SidePanel>
    </section>
  );
}
