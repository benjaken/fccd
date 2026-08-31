import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarOff, PackagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SearchSelect } from "@/components/ui/search-select";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  addAddonBlockDate,
  addAddonProduct,
  archiveAddonBlockDate,
  archiveAddonProduct,
  fetchAddonBlockDates,
  fetchAddonChannels,
  fetchAddonProductSettings,
  searchAddonProducts,
  setAddonProductActive,
  type AddonBlockDate,
  type AddonChannel,
  type AddonProductSearchItem,
  type AddonProductSetting,
} from "@/lib/self-service-addons";

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("zh-HK", {
    style: "currency", currency: "HKD", minimumFractionDigits: 2,
  }).format(value);
}

export function OrderAddonProductsSettings({
  canManage,
  createOpen,
  onCreateOpenChange,
}: {
  canManage: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<AddonChannel[]>([]);
  const [rows, setRows] = useState<AddonProductSetting[]>([]);
  const [channelId, setChannelId] = useState("");
  const [products, setProducts] = useState<AddonProductSearchItem[]>([]);
  const [productId, setProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true); setError("");
    try {
      const [nextChannels, nextRows] = await Promise.all([
        fetchAddonChannels(),
        fetchAddonProductSettings(),
      ]);
      setChannels(nextChannels);
      setRows(nextRows);
      setChannelId((current) => nextChannels.some((channel) => channel.id === current) ? current : "");
    } catch { setError("暫時無法載入加單設定。"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (!createOpen || !channelId) {
      setProducts([]);
      setProductId("");
      return;
    }
    let active = true;
    setProductsLoading(true);
    setError("");
    void searchAddonProducts(channelId, "")
      .then((items) => {
        if (!active) return;
        const configured = new Set(rows.map((row) => row.id));
        const available = items.filter((item) => !configured.has(item.id));
        setProducts(available);
        setProductId((current) => available.some((item) => item.id === current) ? current : "");
      })
      .catch(() => {
        if (!active) return;
        setProducts([]);
        setError("暫時無法載入產品。");
      })
      .finally(() => { if (active) setProductsLoading(false); });
    return () => { active = false; };
  }, [channelId, createOpen, rows]);

  const closeCreatePanel = () => {
    if (saving) return;
    setChannelId("");
    setProductId("");
    setError("");
    onCreateOpenChange(false);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const selectedProduct = products.find((product) => product.id === productId);
    if (!selectedProduct || saving) return;
    setSaving(true); setError("");
    try {
      await addAddonProduct(selectedProduct.channelId, selectedProduct.id);
      setChannelId("");
      setProductId("");
      onCreateOpenChange(false);
      await reload();
    }
    catch { setError("無法加入商品；請確認商品沒有重複。"); }
    finally { setSaving(false); }
  }

  const groupedRows = useMemo(() => [...rows].sort((a, b) =>
    a.channelName.localeCompare(b.channelName, "zh-Hant") || a.sortOrder - b.sortOrder,
  ), [rows]);

  return <>
    {error && !createOpen ? <p className="list-inline-error" role="alert">{error}</p> : null}
    <ListTable loading={loading} loadingLabel="正在載入加單設定…" skeletonColumns={canManage ? 5 : 4}
      header={<tr><th>品牌</th><th>產品</th><th>售價</th><th>啟用</th>{canManage ? <th aria-label="操作" /> : null}</tr>}>
      {groupedRows.length ? groupedRows.map((row) => <tr key={row.settingId}>
        <td>{row.channelName}</td><td><strong>[{row.sku || "—"}] {row.name}</strong></td>
        <td>{money(row.priceOverride ?? row.price)}</td>
        <td><Switch checked={row.isActive} disabled={!canManage} aria-label={`切換 ${row.name} 啟用狀態`} onCheckedChange={(checked) => {
          void setAddonProductActive(row.settingId, checked).then(() => setRows((current) => current.map((item) => item.settingId === row.settingId ? { ...item, isActive: checked } : item))).catch(() => setError("無法更新商品狀態。"));
        }} /></td>
        {canManage ? <td className="table-actions-cell"><Button type="button" variant="outline" size="icon" aria-label={`移除 ${row.name}`} onClick={() => {
          if (!window.confirm(`確定移除「${row.name}」？`)) return;
          void archiveAddonProduct(row.settingId).then(() => setRows((current) => current.filter((item) => item.settingId !== row.settingId))).catch(() => setError("無法移除商品。"));
        }}><Trash2 /></Button></td> : null}
      </tr>) : !loading ? <tr><td colSpan={canManage ? 5 : 4} className="table-empty-cell">尚未設定加單商品。</td></tr> : null}
    </ListTable>
    <SidePanel
      open={canManage && createOpen}
      title="加入產品"
      description="先選擇品牌，再搜尋要提供加單的產品。"
      onClose={closeCreatePanel}
      closeLabel="關閉加入產品側邊欄"
      footer={<>
        <Button type="button" variant="outline" disabled={saving} onClick={closeCreatePanel}>取消</Button>
        <Button type="submit" form="add-addon-product-form" disabled={!productId || saving || productsLoading}>
          <PackagePlus />{saving ? "加入中…" : "加入"}
        </Button>
      </>}
    >
      <form id="add-addon-product-form" className="order-settings-form" onSubmit={(event) => void submit(event)}>
        <label className="order-settings-field">
          <span>品牌</span>
          <SearchSelect
            id="addon-brand-search"
            label="品牌"
            value={channelId}
            options={channels.map((channel) => ({ id: channel.id, name: channel.name }))}
            onChange={(option) => {
              setChannelId(option.id);
              setProductId("");
            }}
            placeholder={t("orderSettings.addonBrandPlaceholder")}
            searchPlaceholder={t("orderSettings.addonBrandSearchPlaceholder")}
            emptyLabel={t("orderSettings.addonBrandEmpty")}
          />
        </label>
        <label className="order-settings-field">
          <span>搜尋產品</span>
          <SearchSelect
            id="addon-product-search"
            label="搜尋產品"
            value={productId}
            disabled={!channelId || productsLoading}
            options={products.map((product) => ({
              id: product.id,
              name: `[${product.sku || "—"}] ${product.name} · ${money(product.price)}`,
            }))}
            onChange={(option) => setProductId(option.id)}
            placeholder={t("orderSettings.addonProductSearchPlaceholder")}
            searchPlaceholder={t("orderSettings.addonProductSearchPlaceholder")}
            emptyLabel={t("orderSettings.addonProductEmpty")}
          />
        </label>
        {error ? <p className="list-inline-error" role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  </>;
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function OrderAddonBlockDatesSettings({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<AddonBlockDate[]>([]);
  const [blockDate, setBlockDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchAddonBlockDates().then(setRows).catch(() => setError("暫時無法載入 Block Date。"))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!blockDate || saving) return;
    setSaving(true); setError("");
    try {
      await addAddonBlockDate(blockDate, reason);
      setRows(await fetchAddonBlockDates()); setBlockDate(""); setReason("");
    } catch { setError("無法加入日期；請確認日期沒有重複。"); }
    finally { setSaving(false); }
  }

  return <>
    {canManage ? <form className="addon-settings-toolbar addon-block-toolbar" onSubmit={(event) => void submit(event)}>
      <label><span>加入 Block Date</span><input type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} /></label>
      <label><span>原因（選填）</span><input value={reason} aria-label="Block Date 原因" onChange={(event) => setReason(event.target.value)} /></label>
      <Button type="submit" disabled={!blockDate || saving}><CalendarOff />{saving ? "加入中…" : "加入"}</Button>
    </form> : null}
    {error ? <p className="list-inline-error" role="alert">{error}</p> : null}
    <ListTable loading={loading} loadingLabel="正在載入 Block Date…" skeletonColumns={canManage ? 3 : 2}
      header={<tr><th>日期</th><th>原因</th>{canManage ? <th aria-label="操作" /> : null}</tr>}>
      {rows.length ? rows.map((row) => <tr key={row.id}><td><strong>{displayDate(row.blockDate)}</strong></td><td>{row.reason || "—"}</td>
        {canManage ? <td className="table-actions-cell"><Button type="button" variant="outline" size="icon" aria-label={`刪除 ${displayDate(row.blockDate)}`} onClick={() => {
          if (!window.confirm(`確定刪除 ${displayDate(row.blockDate)}？`)) return;
          void archiveAddonBlockDate(row.id).then(() => setRows((current) => current.filter((item) => item.id !== row.id))).catch(() => setError("無法刪除日期。"));
        }}><Trash2 /></Button></td> : null}
      </tr>) : !loading ? <tr><td colSpan={canManage ? 3 : 2} className="table-empty-cell">尚未設定 Block Date。</td></tr> : null}
    </ListTable>
  </>;
}
