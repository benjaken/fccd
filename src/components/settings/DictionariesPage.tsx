import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Pencil, Plus } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  createDictItem,
  createDictType,
  fetchDictItemsByTypeId,
  fetchDictTypes,
  updateDictItem,
  updateDictType,
  type DictItem,
  type DictType,
} from "@/lib/dictionaries";
import { filterGenericDictionaryTypes } from "@/lib/order-quote-option-settings";
import { cn } from "@/lib/utils";

type EditorTarget =
  | { kind: "type"; row: DictType | null }
  | { kind: "item"; row: DictItem | null };

function DictionaryEditor({
  target,
  selectedType,
  onClose,
  onSaved,
}: {
  target: EditorTarget | null;
  selectedType: DictType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [metadata, setMetadata] = useState("{}");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target) return;
    if (target.kind === "type") {
      setCode(target.row?.code ?? "");
      setName(target.row?.name ?? "");
      setDescription(target.row?.description ?? "");
      setSortOrder(String(target.row?.sortOrder ?? 0));
      setActive(target.row?.isActive ?? true);
      setLabelEn("");
      setMetadata("{}");
    } else {
      setCode(target.row?.value ?? "");
      setName(target.row?.label ?? "");
      setLabelEn(target.row?.labelEn ?? "");
      setDescription(target.row?.description ?? "");
      setSortOrder(String(target.row?.sortOrder ?? 0));
      setMetadata(JSON.stringify(target.row?.metadata ?? {}, null, 2));
      setActive(target.row?.isActive ?? true);
    }
    setError("");
  }, [target]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) return;
    setSaving(true);
    setError("");
    try {
      if (target.kind === "type") {
        const input = {
          code,
          name,
          description,
          sortOrder: Number(sortOrder) || 0,
          isActive: active,
        };
        if (target.row) await updateDictType(target.row.id, input);
        else await createDictType(input);
      } else {
        if (!selectedType) throw new Error("dict_type_required");
        let parsedMetadata: Record<string, unknown>;
        try {
          const parsed = JSON.parse(metadata || "{}");
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("metadata_object_required");
          }
          parsedMetadata = parsed as Record<string, unknown>;
        } catch {
          setError(t("settings.dictionaries.validation.metadata"));
          return;
        }
        const input = {
          value: code,
          label: name,
          labelEn,
          description,
          metadata: parsedMetadata,
          sortOrder: Number(sortOrder) || 0,
          isActive: active,
        };
        if (target.row) await updateDictItem(target.row.id, input);
        else await createDictItem(selectedType.id, input);
      }
      onSaved();
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message.includes("duplicate")
          ? t("settings.dictionaries.validation.duplicate")
          : t("settings.dictionaries.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  const isType = target?.kind === "type";
  const isEditing = Boolean(target?.row);
  const title = isType
    ? isEditing
      ? t("settings.dictionaries.editType")
      : t("settings.dictionaries.addType")
    : isEditing
      ? t("settings.dictionaries.editItem")
      : t("settings.dictionaries.addItem");

  return (
    <SidePanel
      open={Boolean(target)}
      title={title}
      onClose={onClose}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="dictionary-editor-form" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </>
      }
    >
      <form id="dictionary-editor-form" className="dictionary-editor-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>{isType ? t("settings.dictionaries.fields.code") : t("settings.dictionaries.fields.value")}</span>
          <input value={code} disabled={isEditing} required onChange={(event) => setCode(event.target.value)} />
          {isEditing ? <small>{t("settings.dictionaries.stableValueHint")}</small> : null}
        </label>
        <label>
          <span>{isType ? t("settings.dictionaries.fields.name") : t("settings.dictionaries.fields.label")}</span>
          <input value={name} required onChange={(event) => setName(event.target.value)} />
        </label>
        {!isType ? (
          <label>
            <span>{t("settings.dictionaries.fields.labelEn")}</span>
            <input value={labelEn} onChange={(event) => setLabelEn(event.target.value)} />
          </label>
        ) : null}
        <label>
          <span>{t("settings.dictionaries.fields.description")}</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {!isType ? (
          <label>
            <span>{t("settings.dictionaries.fields.metadata")}</span>
            <textarea className="dictionary-metadata-input" rows={6} value={metadata} onChange={(event) => setMetadata(event.target.value)} />
          </label>
        ) : null}
        <label>
          <span>{t("settings.dictionaries.fields.sortOrder")}</span>
          <input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
        <div className="dictionary-active-field">
          <span>{t("settings.dictionaries.fields.active")}</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  );
}

export function DictionariesPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("settings.dictionaries.edit");
  const [types, setTypes] = useState<DictType[]>([]);
  const [items, setItems] = useState<DictItem[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const selectedType = types.find((row) => row.id === selectedTypeId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoadingTypes(true);
    setError("");
    void fetchDictTypes({ includeInactive: true })
      .then((rows) => {
        if (cancelled) return;
        const visibleRows = filterGenericDictionaryTypes(rows);
        setTypes(visibleRows);
        setSelectedTypeId((current) =>
          visibleRows.some((row) => row.id === current)
            ? current
            : (visibleRows[0]?.id ?? ""),
        );
      })
      .catch(() => !cancelled && setError(t("settings.dictionaries.loadError")))
      .finally(() => !cancelled && setLoadingTypes(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTypeId) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    setError("");
    void fetchDictItemsByTypeId(selectedTypeId, { includeInactive: true })
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setError(t("settings.dictionaries.loadError")))
      .finally(() => !cancelled && setLoadingItems(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey, selectedTypeId, t]);

  const refresh = () => setReloadKey((value) => value + 1);

  return (
    <section className="dictionary-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("navigation.promotion")}</span>
          <h1>{t("settings.dictionaries.title")}</h1>
          <p>{t("settings.dictionaries.description")}</p>
        </div>
      </header>

      {error ? <div className="list-inline-error" role="alert"><span>{error}</span><Button variant="outline" onClick={refresh}>{t("common.retry")}</Button></div> : null}

      <div className="dictionary-layout">
        <aside className="panel dictionary-types" aria-label={t("settings.dictionaries.types") }>
          <header><strong>{t("settings.dictionaries.types")}</strong><span>{types.length}</span></header>
          <div>
            {loadingTypes ? <p>{t("common.loading")}</p> : types.map((row) => (
              <button
                type="button"
                className={cn(row.id === selectedTypeId && "active")}
                key={row.id}
                onClick={() => setSelectedTypeId(row.id)}
              >
                <BookOpen />
                <span><strong>{row.name}</strong><small>{row.code}</small></span>
                {!row.isActive ? <em>{t("common.inactive")}</em> : null}
              </button>
            ))}
          </div>
        </aside>

        <article className="panel dictionary-items">
          <header>
            <div><strong>{selectedType?.name ?? t("settings.dictionaries.items")}</strong><span>{selectedType?.description}</span></div>
            {canEdit ? (
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditor({ kind: "type", row: null })}><Plus />{t("settings.dictionaries.addType")}</Button>
                {selectedType ? <Button type="button" size="sm" variant="outline" onClick={() => setEditor({ kind: "type", row: selectedType })}><Pencil />{t("settings.dictionaries.editType")}</Button> : null}
                {selectedType ? <Button type="button" size="sm" onClick={() => setEditor({ kind: "item", row: null })}><Plus />{t("settings.dictionaries.addItem")}</Button> : null}
              </div>
            ) : null}
          </header>
          <ListTable
            loading={loadingItems}
            loadingLabel={t("settings.dictionaries.loading")}
            skeletonColumns={5}
            header={<tr><th>{t("settings.dictionaries.fields.value")}</th><th>{t("settings.dictionaries.fields.label")}</th><th>{t("settings.dictionaries.fields.labelEn")}</th><th>{t("settings.dictionaries.fields.sortOrder")}</th><th>{t("settings.dictionaries.fields.active")}</th>{canEdit ? <th /> : null}</tr>}
          >
            {items.map((row) => (
              <tr key={row.id}>
                <td><code>{row.value}</code></td>
                <td><strong>{row.label}</strong></td>
                <td>{row.labelEn || "—"}</td>
                <td>{row.sortOrder}</td>
                <td>{row.isActive ? t("common.active") : t("common.inactive")}</td>
                {canEdit ? <td className="table-actions-cell"><Button type="button" size="icon" variant="outline" aria-label={t("common.edit")} onClick={() => setEditor({ kind: "item", row })}><Pencil /></Button></td> : null}
              </tr>
            ))}
          </ListTable>
        </article>
      </div>

      <DictionaryEditor
        target={editor}
        selectedType={selectedType}
        onClose={() => setEditor(null)}
        onSaved={refresh}
      />
    </section>
  );
}
