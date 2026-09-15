import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  CalendarOff,
  Clock3,
  Info,
  MessageSquareText,
  PackagePlus,
  Pencil,
  Store,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SearchSelect } from "@/components/ui/search-select";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import {
  addAddonProduct,
  archiveAddonProduct,
  fetchAddonChannels,
  fetchAddonProductSettings,
  searchAddonProducts,
  setAddonProductActive,
  type AddonChannel,
  type AddonProductSearchItem,
  type AddonProductSetting,
} from "@/lib/self-service-addons";
import {
  archiveOrderIntakeRule,
  createOrderIntakeRule,
  fetchOrderIntakeRules,
  type OrderIntakeRuleInput,
  type OrderIntakeRuleSetting,
  updateOrderIntakeRule,
} from "@/lib/order-intake-rules";

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

export function OrderAddonBlockDatesSettings({ canManage, createOpen, onCreateOpenChange, action }: {
  canManage: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<OrderIntakeRuleSetting[]>([]);
  const [channels, setChannels] = useState<AddonChannel[]>([]);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [timeMode, setTimeMode] = useState<"all_day" | "time_range">("all_day");
  const [handling, setHandling] = useState<"allow_only" | "manual_review">("manual_review");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [productTerms, setProductTerms] = useState<Record<string, string>>({});
  const [addonHandling, setAddonHandling] = useState<"allow" | "manual_review">("manual_review");
  const [brandTerms, setBrandTerms] = useState<Record<string, string>>({});
  const [customerMessage, setCustomerMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingRule, setEditingRule] = useState<OrderIntakeRuleSetting | null>(null);

  useEffect(() => {
    void Promise.all([fetchOrderIntakeRules(), fetchAddonChannels()]).then(([rules, brands]) => {
      setRows(rules); setChannels(brands);
    }).catch(() => setError("暫時無法載入全局接單安排。"))
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setName(""); setStartsOn(""); setEndsOn(""); setStartTime(""); setEndTime("");
    setTimeMode("all_day"); setHandling("manual_review"); setSelectedChannels([]);
    setProductTerms({}); setAddonHandling("manual_review");
    setBrandTerms({}); setCustomerMessage(""); setInternalNote(""); setError("");
    setEditingRule(null);
  };

  const closeCreatePanel = () => {
    if (saving) return;
    resetForm();
    onCreateOpenChange(false);
  };

  const openEditPanel = (rule: OrderIntakeRuleSetting) => {
    onCreateOpenChange(false);
    setEditingRule(rule);
    setName(rule.name);
    setStartsOn(rule.startsOn);
    setEndsOn(rule.endsOn);
    setStartTime(rule.startTime ?? "");
    setEndTime(rule.endTime ?? "");
    setTimeMode(rule.startTime && rule.endTime ? "time_range" : "all_day");
    setHandling(rule.handling);
    setAddonHandling(rule.addonHandling);
    setSelectedChannels(rule.channels.map((channel) => channel.channelId));
    setProductTerms(Object.fromEntries(rule.channels.map((channel) => [channel.channelId, channel.productTerms.join(", ")])));
    setBrandTerms(Object.fromEntries(rule.channels.map((channel) => [channel.channelId, channel.brandTerms.join(", ")])));
    setCustomerMessage(rule.customerMessage ?? "");
    setInternalNote(rule.internalNote ?? "");
    setError("");
  };

  const timeRangeInvalid = timeMode === "time_range" && (
    !startTime || !endTime || endTime <= startTime
  );
  const brandSelectionInvalid = handling === "allow_only" && selectedChannels.length === 0;
  const productSelectionInvalid = handling === "allow_only" && selectedChannels.some((id) =>
    !(productTerms[id] || "").split(/[,，\n]/).some((term) => term.trim()),
  );
  const canSubmit = Boolean(
    name.trim() && startsOn && endsOn && endsOn >= startsOn && !timeRangeInvalid && !brandSelectionInvalid && !productSelectionInvalid,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true); setError("");
    try {
      const input: OrderIntakeRuleInput = { name, startsOn, endsOn,
        startTime: timeMode === "time_range" ? startTime : "",
        endTime: timeMode === "time_range" ? endTime : "", handling,
        addonHandling, customerMessage, internalNote,
        channels: selectedChannels.map((channelId) => ({ channelId,
          brandTerms: (brandTerms[channelId] || "").split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
          productTerms: (productTerms[channelId] || "").split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) })) };
      if (editingRule) await updateOrderIntakeRule(editingRule.id, input);
      else await createOrderIntakeRule(input);
      setRows(await fetchOrderIntakeRules());
      resetForm();
      onCreateOpenChange(false);
    } catch { setError(`無法${editingRule ? "儲存" : "建立"}接單安排，請檢查日期、時間及品牌資料。`); }
    finally { setSaving(false); }
  }

  return <>
    {error && !createOpen && !editingRule ? <p className="list-inline-error" role="alert">{error}</p> : null}
    <div className="order-intake-toolbar">
      <div className="order-intake-guidance" role="note">
        <Info aria-hidden="true" />
        <p><strong>同一廚房的全局接單例外：</strong>可設定節日或特別日子的安排。多項安排重疊時須同時符合；人工覆核優先，時段包含開始時間、不包含結束時間。</p>
      </div>
      {action ? <div className="order-intake-toolbar-action">{action}</div> : null}
    </div>
    <ListTable className="order-intake-table-wrap" tableClassName="order-intake-table" loading={loading} loadingLabel="正在載入全局接單安排…" skeletonColumns={canManage ? 5 : 4}
      header={<tr><th>安排</th><th>日期／時段</th><th>處理方式</th><th>可推薦品牌</th>{canManage ? <th aria-label="操作" /> : null}</tr>}>
      {rows.length ? rows.map((row) => <tr key={row.id}>
        <td><div className="order-intake-name-cell"><strong>{row.name}</strong><small>{row.internalNote || row.customerMessage || "未有備註"}</small></div></td>
        <td><div className="order-intake-schedule-cell"><span><CalendarDays aria-hidden="true" />{displayDate(row.startsOn)}{row.endsOn !== row.startsOn ? ` – ${displayDate(row.endsOn)}` : ""}</span><small><Clock3 aria-hidden="true" />{row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : "全日"}</small></div></td>
        <td><span className={`status-badge ${row.handling === "allow_only" ? "blue" : "amber"}`}>{row.handling === "allow_only" ? "只接受指定品牌／產品" : "人工覆核"}</span></td>
        <td>{row.channels.length ? <div className="order-intake-brand-list">{row.channels.map((item) => <span key={item.id}>{item.channelName}</span>)}</div> : <span className="order-intake-empty-value">不適用</span>}</td>
        {canManage ? <td className="table-actions-cell"><div className="table-row-actions"><Button type="button" variant="outline" size="icon" aria-label={`編輯 ${row.name}`} onClick={() => openEditPanel(row)}><Pencil /></Button><Button type="button" variant="outline" size="icon" aria-label={`刪除 ${row.name}`} onClick={() => {
          if (!window.confirm(`確定刪除「${row.name}」？`)) return;
          void archiveOrderIntakeRule(row.id).then(() => setRows((current) => current.filter((item) => item.id !== row.id))).catch(() => setError("無法刪除接單安排。"));
        }}><Trash2 /></Button></div></td> : null}
      </tr>) : !loading ? <tr><td colSpan={canManage ? 5 : 4} className="table-empty-cell">尚未設定特別接單安排；一般時段可正常落單。</td></tr> : null}
    </ListTable>
    <SidePanel open={canManage && (createOpen || Boolean(editingRule))} title={editingRule ? "編輯接單安排" : "新增接單安排"} description="設定適用日期、時段，以及命中安排後的處理方式。" onClose={closeCreatePanel} closeLabel={`關閉${editingRule ? "編輯" : "新增"}接單安排側邊欄`} wide className="order-intake-create-panel"
      footer={<><Button type="button" variant="outline" disabled={saving} onClick={closeCreatePanel}>取消</Button><Button type="submit" form="order-intake-rule-form" disabled={saving || !canSubmit}>{editingRule ? <Pencil /> : <CalendarOff />}{saving ? "儲存中…" : editingRule ? "儲存變更" : "建立安排"}</Button></>}>
      <form id="order-intake-rule-form" className="order-intake-form" onSubmit={(event) => void submit(event)}>
        <section className="order-intake-form-section" aria-labelledby="order-intake-basics-title">
          <div className="order-intake-form-section-heading"><CalendarDays aria-hidden="true" /><div><h3 id="order-intake-basics-title">日期與時段</h3><p>同一天請選相同開始及結束日期。</p></div></div>
          <label className="order-settings-field"><span>安排名稱</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("orderSettings.orderIntakeNamePlaceholder")} /></label>
          <div className="order-intake-field-grid">
            <label className="order-settings-field"><span>開始日期</span><input type="date" value={startsOn} onChange={(event) => { setStartsOn(event.target.value); if (!endsOn || endsOn < event.target.value) setEndsOn(event.target.value); }} /></label>
            <label className="order-settings-field"><span>結束日期</span><input type="date" min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
          </div>
          <fieldset className="order-intake-time-fieldset">
            <legend>時段</legend>
            <div className="order-intake-segmented" aria-label="選擇接單安排時段">
              <button type="button" className={timeMode === "all_day" ? "is-active" : undefined} aria-pressed={timeMode === "all_day"} onClick={() => { setTimeMode("all_day"); setStartTime(""); setEndTime(""); }}><CalendarDays aria-hidden="true" />全日</button>
              <button type="button" className={timeMode === "time_range" ? "is-active" : undefined} aria-pressed={timeMode === "time_range"} onClick={() => setTimeMode("time_range")}><Clock3 aria-hidden="true" />指定時段</button>
            </div>
          </fieldset>
          {timeMode === "time_range" ? <div className="order-intake-field-grid order-intake-time-grid">
            <label className="order-settings-field"><span>開始時間</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
            <label className="order-settings-field"><span>結束時間</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            {timeRangeInvalid && (startTime || endTime) ? <small className="order-intake-field-error">請同時填寫開始及結束時間，結束時間須晚於開始時間。</small> : null}
          </div> : null}
        </section>

        <section className="order-intake-form-section" aria-labelledby="order-intake-handling-title">
          <div className="order-intake-form-section-heading"><Store aria-hidden="true" /><div><h3 id="order-intake-handling-title">命中後如何處理</h3><p>選擇保留需求給同事，或只推薦仍可接單的品牌。</p></div></div>
          <label className="order-settings-field"><span>處理方式</span><select value={handling} onChange={(event) => setHandling(event.target.value as typeof handling)}><option value="manual_review">先留需求，人工覆核</option><option value="allow_only">只接受指定品牌及產品</option></select></label>
          <label className="order-settings-field"><span>自助加購</span><select value={addonHandling} onChange={(event) => setAddonHandling(event.target.value as typeof addonHandling)}><option value="manual_review">轉人工覆核</option><option value="allow">沿用一般加購安排</option></select><small>獨立於新單政策；沿用一般安排仍須符合原有截止時間及可加購產品限制。</small></label>
          <div className={`order-intake-outcome ${handling === "allow_only" ? "is-allow-only" : "is-manual-review"}`}>
            <strong>{handling === "allow_only" ? "系統只會推薦下方選取的品牌" : "系統會收集需求，再交由同事確認"}</strong>
            <span>{handling === "allow_only" ? "未選取的品牌不會被承諾可接單。" : "客人不會因為命中安排而被直接拒絕。"}</span>
          </div>
          {handling === "allow_only" ? <div className="order-intake-brand-settings">
            <fieldset className="order-intake-brand-fieldset"><legend>可接品牌</legend><div className="order-intake-brand-options">{channels.map((channel) => <label key={channel.id}><input type="checkbox" checked={selectedChannels.includes(channel.id)} onChange={(event) => setSelectedChannels((current) => event.target.checked ? [...current, channel.id] : current.filter((id) => id !== channel.id))} /><span>{channel.name}</span></label>)}</div>{brandSelectionInvalid ? <small className="order-intake-field-error">請至少選擇一個可接品牌。</small> : null}</fieldset>
            <small>每個品牌分別設定允許產品，以逗號分隔。實際產品及訂購連結會由產品資料庫自動取得。</small>
            {selectedChannels.map((id) => <div className="order-intake-channel-card" key={id}>
              <strong>{channels.find((item) => item.id === id)?.name}</strong>
              <label className="order-settings-field"><span>允許產品關鍵字</span><input value={productTerms[id] || ""} onChange={(event) => setProductTerms((current) => ({ ...current, [id]: event.target.value }))} aria-label={`${channels.find((item) => item.id === id)?.name} 允許產品關鍵字`} placeholder={t("orderSettings.orderIntakeProductPlaceholder")} /></label>
              <label className="order-settings-field"><span>品牌別名</span><input value={brandTerms[id] || ""} onChange={(event) => setBrandTerms((current) => ({ ...current, [id]: event.target.value }))} aria-label={`${channels.find((item) => item.id === id)?.name} 品牌別名`} /><small>選填；只用於識別客人常用的品牌稱呼。</small></label>
            </div>)}
            {productSelectionInvalid ? <small className="order-intake-field-error">請為每個可接品牌填寫至少一個允許產品關鍵字。</small> : null}
          </div> : null}
        </section>

        <section className="order-intake-form-section" aria-labelledby="order-intake-copy-title">
          <div className="order-intake-form-section-heading"><MessageSquareText aria-hidden="true" /><div><h3 id="order-intake-copy-title">訊息與備註</h3><p>客人訊息會用於回覆；內部備註只供同事查看。</p></div></div>
          <label className="order-settings-field"><span>客人訊息</span><textarea rows={3} value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} placeholder={t("orderSettings.orderIntakeMessagePlaceholder")} /></label>
          <label className="order-settings-field"><span>內部備註</span><textarea rows={2} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder={t("orderSettings.orderIntakeInternalNotePlaceholder")} /></label>
        </section>
        {error ? <p className="list-inline-error" role="alert">{error}</p> : null}
      </form>
    </SidePanel>
  </>;
}
