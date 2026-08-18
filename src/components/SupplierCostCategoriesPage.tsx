import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";

type Category = { id: string; name: string; description: string | null; isActive: boolean };

export function SupplierCostCategoriesPage() {
  const { t } = useTranslation(); const access = useCurrentPageAccess(); const canEdit = access.canAccess("restaurant.settings.supplier_cost_categories.edit"); const canDelete = access.canAccess("restaurant.settings.supplier_cost_categories.delete");
  const [rows, setRows] = useState<Category[]>([]); const [loading, setLoading] = useState(true); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Category | null>(null); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [active, setActive] = useState(true); const [saving, setSaving] = useState(false);
  const load = () => {
    setLoading(true);
    void supabase.from("supplier_cost_categories").select("id,name,description,is_active").is("archived_at", null).order("name")
      .then(({ data }) => {
        setRows((data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, description: row.description as string | null, isActive: Boolean(row.is_active) })));
        setLoading(false);
      }, () => setLoading(false));
  };
  useEffect(load, []);
  const close = () => { setOpen(false); setEditing(null); setName(""); setDescription(""); setActive(true); };
  const edit = (row: Category | null) => { setEditing(row); setName(row?.name ?? ""); setDescription(row?.description ?? ""); setActive(row?.isActive ?? true); setOpen(true); };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; setSaving(true); const fields = { name: name.trim(), description: description.trim() || null, is_active: active }; if (editing) await supabase.from("supplier_cost_categories").update(fields).eq("id", editing.id); else await supabase.from("supplier_cost_categories").insert({ legacy_id: `web-supplier-cost-category-${crypto.randomUUID()}`, ...fields }); close(); load(); setSaving(false); };
  const toggle = async (row: Category) => { await supabase.from("supplier_cost_categories").update({ is_active: !row.isActive }).eq("id", row.id); load(); };
  const remove = async (row: Category) => { if (!window.confirm(t("supplierCostCategories.deleteConfirm", { name: row.name }))) return; await supabase.from("supplier_cost_categories").update({ archived_at: new Date().toISOString() }).eq("id", row.id); load(); };
  return <section className="ingredients-page"><header className="page-heading ingredients-heading"><div><span className="eyebrow">{t("navigation.restaurant")}</span><h1>{t("supplierCostCategories.title")}</h1><p>{t("supplierCostCategories.description")}</p></div>{canEdit ? <Button onClick={() => edit(null)}><Plus />{t("supplierCostCategories.add")}</Button> : null}</header><article className="panel ingredients-panel"><ListTable className="ingredients-table-wrap" loading={loading} loadingLabel={t("supplierCostCategories.loading")} skeletonColumns={canEdit || canDelete ? 4 : 3} header={<tr><th>{t("supplierCostCategories.columns.name")}</th><th>{t("supplierCostCategories.columns.description")}</th><th>{t("supplierCostCategories.columns.status")}</th>{canEdit || canDelete ? <th aria-label={t("supplierCostCategories.columns.actions")} /> : null}</tr>}>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.description || "—"}</td><td>{canEdit ? <Switch checked={row.isActive} onCheckedChange={() => void toggle(row)} aria-label={row.isActive ? t("supplierCostCategories.active") : t("supplierCostCategories.inactive")} /> : row.isActive ? t("supplierCostCategories.active") : t("supplierCostCategories.inactive")}</td>{canEdit || canDelete ? <td className="table-actions-cell"><div className="table-row-actions">{canEdit ? <Button size="icon" variant="outline" aria-label={t("supplierCostCategories.edit")} onClick={() => edit(row)}><Pencil /></Button> : null}{canDelete ? <Button size="icon" variant="destructive" aria-label={t("supplierCostCategories.delete")} onClick={() => void remove(row)}><Trash2 /></Button> : null}</div></td> : null}</tr>)}</ListTable></article><SidePanel open={open} title={t(editing ? "supplierCostCategories.editTitle" : "supplierCostCategories.addTitle")} onClose={close} closeLabel={t("supplierCostCategories.close")} footer={<><Button variant="outline" onClick={close}>{t("supplierCostCategories.cancel")}</Button><Button type="submit" form="supplier-cost-category-form" disabled={saving}>{saving ? t("supplierCostCategories.saving") : t("supplierCostCategories.save")}</Button></>}><form id="supplier-cost-category-form" className="ingredients-form" onSubmit={(event) => void submit(event)}><label className="ingredients-field"><span>{t("supplierCostCategories.fields.name")}</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("supplierCostCategories.fields.namePlaceholder")} /></label><label className="ingredients-field"><span>{t("supplierCostCategories.fields.description")}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("supplierCostCategories.fields.descriptionPlaceholder")} /></label><label className="ingredients-field"><span>{t("supplierCostCategories.fields.status")}</span><Switch checked={active} onCheckedChange={setActive} /></label></form></SidePanel></section>;
}
