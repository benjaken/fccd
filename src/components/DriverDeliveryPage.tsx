import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  Banknote,
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Download,
  ExternalLink,
  Filter,
  LogOut,
  Map,
  MapPin,
  MessageCircle,
  Menu,
  PackageCheck,
  Search,
  Settings,
  Phone,
  Plus,
  Trash2,
  UserRound,
  Truck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchDriverAvailableOrders,
  fetchDriverAcceptedOrders,
  fetchDriverDistrictFees,
  fetchDriverFleetDays,
  fetchDriverFleetDayOrders,
  fetchDriverFleetDrivers,
  fetchDriverFleetSummary,
  fetchDriverIncomeSummary,
  fetchDriverIncomeDays,
  fetchDriverIncomeDayOrders,
  fetchDriverExportOrders,
  fetchDriverSurchargeTypes,
  addDriverSurcharge,
  addDriverFleetDriver,
  deleteDriverFleetDriver,
  deleteDriverSurcharge,
  uploadDriverDeliveryImage,
  deleteDriverDeliveryImage,
  rejectDriverAvailableOrder,
  acceptDriverAvailableOrder,
  pickupDriverOrder,
  deliverDriverOrder,
  assignAcceptedOrderDriver,
  loginDriverDelivery,
  logoutDriverDelivery,
  restoreDriverDeliverySession,
  type DriverAvailableOrder,
  type DriverAcceptedOrder,
  type DriverDeliverySession,
  type DriverFleetDay,
  type DriverFleetDriver,
  type DriverFleetMonth,
  type DriverFleetOrder,
} from "@/lib/driver-delivery";
import { addCalendarDays, hongKongDateInputValue } from "@/lib/deliveries";

function formatPortalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-HK", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatStatusTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

function DriverLogin({ onLogin }: { onLogin: (session: DriverDeliverySession) => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      onLogin(await loginDriverDelivery(code));
    } catch {
      setError("登入密碼不正確，請重新輸入。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="driver-login-shell">
      <section className="driver-login-panel" aria-labelledby="driver-login-title">
        <div className="driver-brand-mark" aria-hidden="true"><Truck /></div>
        <p className="driver-eyebrow">Food Channels</p>
        <h1 id="driver-login-title">司機送貨平台</h1>
        <p className="driver-login-intro">輸入車隊登入密碼，查看今天可接的送貨訂單。</p>
        <form onSubmit={submit} className="driver-login-form">
          <label htmlFor="driver-login-code">登入密碼</label>
          <input
            id="driver-login-code"
            autoComplete="one-time-code"
            inputMode="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t("driverDelivery.loginCodePlaceholder")}
            autoFocus
          />
          {error ? <p className="driver-form-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={!code.trim() || loading}>
            {loading ? "登入中…" : "登入"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function DriverDrawer({
  open,
  teamName,
  onClose,
  onLogout,
  page,
  onNavigate,
}: {
  open: boolean;
  teamName: string;
  onClose: () => void;
  onLogout: () => void;
  page: DriverPortalPage;
  onNavigate: (page: DriverPortalPage) => void;
}) {
  return (
    <div className={`driver-drawer-layer${open ? " is-open" : ""}`} aria-hidden={!open}>
      <button className="driver-drawer-scrim" aria-label="關閉選單" onClick={onClose} />
      <aside className="driver-drawer" aria-label="司機送貨選單">
        <header><strong>{teamName}</strong><Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉選單"><X /></Button></header>
        <nav>
          <div className="driver-nav-group-title"><Archive /><span>我的訂單</span><ChevronDown /></div>
          <button className={page === "available" ? "is-active" : ""} onClick={() => { onNavigate("available"); onClose(); }}><CircleCheck />可接訂單</button>
          <button className={page === "accepted" ? "is-active" : ""} onClick={() => { onNavigate("accepted"); onClose(); }}><PackageCheck />已接訂單</button>
          <button className={page === "fleet" ? "is-active" : ""} onClick={() => { onNavigate("fleet"); onClose(); }}><Truck />車隊訂單</button>
          <button className={`driver-nav-primary${page === "income" ? " is-active" : ""}`} onClick={() => { onNavigate("income"); onClose(); }}><Banknote />合共收入</button>
          <button className={`driver-nav-primary${page === "districts" ? " is-active" : ""}`} onClick={() => { onNavigate("districts"); onClose(); }}><Map />分區運費</button>
        </nav>
        <footer>
          <button className={page === "settings" ? "is-active" : ""} onClick={() => { onNavigate("settings"); onClose(); }}><Settings />設定</button>
          <button onClick={onLogout}><LogOut />登出</button>
        </footer>
      </aside>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(value);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${year}年${month}月`;
}

function dayLabel(value: string) {
  return `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
}

function csvValue(value: string) { return `"${value.replaceAll('"', '""')}"`; }

async function exportFleetOrders(token: string, month: string, includeUnassigned: boolean) {
  const rows = await fetchDriverExportOrders(token, month, includeUnassigned);
  const headers = ["訂單號碼","送貨日期","送貨時間","客戶姓名","客戶電話","送貨地區","送貨地址","送貨方式","車隊司機"];
  const csv = [headers.map(csvValue).join(","), ...rows.map((row) => {
    const date = row.deliveryDate ? `${row.deliveryDate.slice(5,7)}月${row.deliveryDate.slice(8,10)}日` : "";
    return [row.orderNumber,date,row.deliveryTime,row.customerName,row.customerPhone,row.district,row.address,row.shippingMethod,row.driverName].map(csvValue).join(",");
  })].join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `driver-orders-${month}.csv`; link.click();
  URL.revokeObjectURL(url);
}

function shippingMethodClass(value: string | null) {
  const normalized = value?.trim() || "";
  if (/車邊|路邊/.test(normalized)) return "is-curbside";
  if (/上門|送到|樓上/.test(normalized)) return "is-door";
  if (/自取/.test(normalized)) return "is-pickup";
  return "is-standard";
}

function shippingMethodLabel(value: string | null) {
  const normalized = value?.trim() || "";
  if (/車邊|路邊/.test(normalized)) return "車邊";
  if (/上門|送到|樓上/.test(normalized)) return "上門";
  return normalized || "送貨";
}

function customerPhoneLinks(value: string | null) {
  const firstNumber = value?.match(/\d[\d\s-]{6,}\d/)?.[0]?.replace(/\D/g, "") || "";
  if (!firstNumber) return null;
  const whatsappNumber = firstNumber.length === 8 ? `852${firstNumber}` : firstNumber;
  return { telephone: firstNumber, whatsapp: `https://wa.me/${whatsappNumber}` };
}

type DriverPortalPage = "available" | "accepted" | "fleet" | "income" | "districts" | "settings";

const DRIVER_PORTAL_PATHS: Record<DriverPortalPage, string> = {
  available: "/driver-delivery/available",
  accepted: "/driver-delivery/accepted",
  fleet: "/driver-delivery/fleet",
  income: "/driver-delivery/income",
  districts: "/driver-delivery/districts",
  settings: "/driver-delivery/settings",
};

function driverPortalPageFromPath(pathname: string): DriverPortalPage | null {
  return (Object.entries(DRIVER_PORTAL_PATHS) as Array<[DriverPortalPage, string]>).find(
    ([, path]) => pathname === path,
  )?.[0] ?? null;
}

function AcceptedOrderTools({ session, order, onChanged }: { session: DriverDeliverySession; order: DriverAcceptedOrder; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const [types, setTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [adding, setAdding] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchDriverSurchargeTypes(session.token).then(setTypes).catch(() => setTypes([])); }, [session.token]);

  async function save() {
    const entries = types.map((type) => ({ id:type.id, amount:Number(amounts[type.id]) })).filter((item) => Number.isFinite(item.amount) && item.amount > 0);
    if (!entries.length) return;
    setBusy(true);
    try {
      await Promise.all(entries.map((item) => addDriverSurcharge(session.token,order.deliveryId,item.id,item.amount)));
      await onChanged();
      setAmounts({}); setAdding(false);
    } finally { setBusy(false); }
  }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try { await uploadDriverDeliveryImage(session.token,order.deliveryId,file); await onChanged(); }
    finally { setBusy(false); }
  }

  async function removeSurcharge(surchargeId: string) {
    setBusy(true);
    try {
      await deleteDriverSurcharge(session.token, surchargeId);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="driver-completed-order-actions"><Button size="sm" onClick={()=>setAdding(true)}><Plus />新增附加費</Button><label className={`driver-card-image-upload${busy?" is-busy":""}`}><Camera />{busy?"處理中…":"上傳圖片"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event)=>{void upload(event.target.files?.[0]);event.currentTarget.value="";}} /></label></div>
    {order.surcharges.length ? <div className="driver-card-surcharges">{order.surcharges.map((fee)=><div key={fee.id}><span>{fee.name}</span><strong>{money(fee.amount)}</strong><Button variant="ghost" size="icon" disabled={busy} aria-label={`刪除 ${fee.name}`} onClick={() => void removeSurcharge(fee.id)}><X /></Button></div>)}</div> : null}
    {order.images.length ? <div className="driver-card-image-count"><Camera />已上傳 {order.images.length} 張圖片</div> : null}
    {adding ? <div className="driver-surcharge-dialog-layer" role="dialog" aria-modal="true" aria-labelledby={`accepted-surcharge-${order.deliveryId}`}><button className="driver-confirm-scrim" aria-label="關閉新增附加費" onClick={()=>setAdding(false)} /><article><header><h2 id={`accepted-surcharge-${order.deliveryId}`}>新增附加費</h2><Button variant="ghost" size="icon" onClick={()=>setAdding(false)} aria-label="關閉"><X /></Button></header><div className="driver-surcharge-options">{types.map((type)=><label key={type.id}><span>{type.name}</span><span className="driver-surcharge-money"><span>$</span><input type="number" min="0" step="0.01" value={amounts[type.id]??""} onChange={(event)=>setAmounts((current)=>({...current,[type.id]:event.target.value}))} aria-label={`${type.name}金額`} placeholder={t("driverDelivery.surchargeAmountPlaceholder")} /></span></label>)}</div><footer><strong>所有附加費: {money(types.reduce((total,type)=>total+(Number(amounts[type.id])||0),0))}</strong><Button disabled={busy||!types.some((type)=>(Number(amounts[type.id])||0)>0)} onClick={()=>void save()}>{busy?"儲存中…":"完成"}</Button></footer></article></div> : null}
  </>;
}

function FleetOrderModal({ session, order, onClose, onChanged }: { session: DriverDeliverySession; order: DriverFleetOrder; onClose: () => void; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const [types, setTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [drivers, setDrivers] = useState<DriverFleetDriver[]>([]);
  const [adding, setAdding] = useState(false);
  const [surchargeAmounts, setSurchargeAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [confirmDeleteUrl, setConfirmDeleteUrl] = useState("");
  useEffect(() => { fetchDriverSurchargeTypes(session.token).then(setTypes).catch(() => setTypes([])); }, [session.token]);
  useEffect(() => { fetchDriverFleetDrivers(session.token).then(setDrivers).catch(() => setDrivers([])); }, [session.token]);

  async function saveSurcharge() {
    const entries = types.map((type) => ({ typeId: type.id, value: Number(surchargeAmounts[type.id]) })).filter((item) => Number.isFinite(item.value) && item.value > 0);
    if (!entries.length) return;
    setBusy(true);
    await Promise.all(entries.map((item) => addDriverSurcharge(session.token, order.deliveryId, item.typeId, item.value))).then(onChanged).finally(() => setBusy(false));
    setAdding(false); setSurchargeAmounts({});
  }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    await uploadDriverDeliveryImage(session.token, order.deliveryId, file).then(onChanged).finally(() => setBusy(false));
  }

  async function removeImage(url: string) {
    setBusy(true);
    await deleteDriverDeliveryImage(session.token, order.deliveryId, url).then(onChanged).finally(() => setBusy(false));
    setPreviewUrl(""); setConfirmDeleteUrl("");
  }

  return (
    <div className="driver-order-modal-layer" role="dialog" aria-modal="true" aria-label={`訂單 ${order.orderNumber}`}>
      <button className="driver-order-modal-scrim" onClick={onClose} aria-label="關閉訂單詳情" />
      <article className="driver-order-modal">
        <header><div><span>訂單號碼</span><h2>{order.orderNumber}</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉訂單詳情"><X /></Button></header>
        <div className="driver-order-modal-times"><div><span>出車時間</span><strong>{order.shipOutTime || "—"}</strong></div><div><span>送達時間</span><strong>{order.deliveryTime || "—"}</strong></div></div>
        <div className="driver-order-modal-address"><MapPin /><strong>{order.address}</strong></div>
        <div className="driver-order-contact">{order.customerName ? <span><UserRound />{order.customerName}</span> : null}{order.customerPhone ? <a href={`tel:${order.customerPhone}`}><Phone />{order.customerPhone}</a> : null}</div>
        {customerPhoneLinks(order.customerPhone) ? <div className="driver-modal-contact-actions"><a href={customerPhoneLinks(order.customerPhone)!.whatsapp} target="_blank" rel="noreferrer" className="is-whatsapp" aria-label={`WhatsApp 聯絡 ${order.customerName || "客戶"}`}><MessageCircle /></a><a href={`tel:${customerPhoneLinks(order.customerPhone)!.telephone}`} className="is-phone" aria-label={`致電 ${order.customerName || "客戶"}`}><Phone /></a></div> : null}
        <label className="driver-assign-driver"><span>指派司機</span><select value={order.driverId ?? ""} disabled={busy || Boolean(order.fulfilledAt)} onChange={(event) => { if (!event.target.value) return; setBusy(true); void assignAcceptedOrderDriver(session.token, order.deliveryId, event.target.value).then(onChanged).finally(() => setBusy(false)); }}><option value="">選擇車隊司機</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label>
        <div className="driver-order-fees"><span>地區運費 <strong>{money(order.basicFee)}</strong></span><span>總運費 <strong>{money(order.totalFee)}</strong></span></div>
        <section className="driver-surcharge-section"><div className="driver-modal-section-title"><h3>附加費</h3><Button size="sm" onClick={() => setAdding(true)}>新增附加費</Button></div>
          {order.surcharges.length ? order.surcharges.map((fee) => <div className="driver-surcharge-row" key={fee.id}><span>{fee.name}</span><strong>{money(fee.amount)}</strong><Button variant="ghost" size="icon" aria-label={`刪除 ${fee.name}`} onClick={() => { setBusy(true); void deleteDriverSurcharge(session.token, fee.id).then(onChanged).finally(() => setBusy(false)); }}><X /></Button></div>) : <p className="driver-modal-empty">未有附加費</p>}
        </section>
        <section className="driver-images-section"><div className="driver-modal-section-title"><h3>送貨圖片</h3><label className="driver-image-upload"><Camera />上傳圖片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => void upload(event.target.files?.[0])} /></label></div>
          <div className="driver-image-grid">{order.images.map((url) => <div className="driver-image-tile" key={url}><button type="button" onClick={() => setPreviewUrl(url)}><img src={url} alt="送貨記錄" /></button><button type="button" className="driver-image-delete" aria-label="刪除送貨圖片" onClick={() => setConfirmDeleteUrl(url)}><X /></button></div>)}</div>
          {!order.images.length ? <p className="driver-modal-empty">未有上傳圖片</p> : null}
        </section>
      </article>
      {adding ? <div className="driver-surcharge-dialog-layer" role="dialog" aria-modal="true" aria-labelledby="driver-surcharge-title"><button className="driver-confirm-scrim" aria-label="關閉新增附加費" onClick={() => setAdding(false)} /><article><header><h2 id="driver-surcharge-title">新增附加費</h2><Button variant="ghost" size="icon" onClick={() => setAdding(false)} aria-label="關閉"><X /></Button></header><div className="driver-surcharge-options">{types.map((type) => <label key={type.id}><span>{type.name}</span><span className="driver-surcharge-money"><span>$</span><input type="number" min="0" step="0.01" value={surchargeAmounts[type.id] ?? ""} onChange={(event) => setSurchargeAmounts((current) => ({...current,[type.id]:event.target.value}))} aria-label={`${type.name}金額`} placeholder={t("driverDelivery.surchargeAmountPlaceholder")} /></span></label>)}</div><footer><strong>所有附加費: {money(types.reduce((total,type)=>total+(Number(surchargeAmounts[type.id])||0),0))}</strong><Button disabled={busy || !types.some((type)=>(Number(surchargeAmounts[type.id])||0)>0)} onClick={() => void saveSurcharge()}>{busy?"儲存中…":"完成"}</Button></footer></article></div> : null}
      {confirmDeleteUrl && !previewUrl ? <div className="driver-confirm-layer" role="alertdialog" aria-modal="true"><button className="driver-confirm-scrim" aria-label="取消刪除" onClick={() => setConfirmDeleteUrl("")} /><article><header><h2>刪除送貨圖片</h2></header><div><strong>確定刪除這張圖片？</strong><p>刪除後無法復原。</p></div><footer><Button variant="outline" onClick={() => setConfirmDeleteUrl("")}>取消</Button><Button variant="destructive" disabled={busy} onClick={() => void removeImage(confirmDeleteUrl)}>確定刪除</Button></footer></article></div> : null}
      {previewUrl ? <div className="driver-image-preview"><button className="driver-image-preview-scrim" onClick={() => setPreviewUrl("")} aria-label="關閉圖片預覽" /><div><img src={previewUrl} alt="送貨圖片預覽" /><header><Button variant="secondary" onClick={() => setPreviewUrl("")}><X />關閉</Button>{confirmDeleteUrl === previewUrl ? <><span>確定刪除圖片？</span><Button variant="destructive" disabled={busy} onClick={() => void removeImage(previewUrl)}><Trash2 />確定刪除</Button></> : <Button variant="destructive" onClick={() => setConfirmDeleteUrl(previewUrl)}><Trash2 />刪除圖片</Button>}</header></div></div> : null}
    </div>
  );
}

function FleetOrdersView({ session, income = false }: { session: DriverDeliverySession; income?: boolean }) {
  const [drivers, setDrivers] = useState<DriverFleetDriver[]>([]);
  const [driverId, setDriverId] = useState("");
  const [months, setMonths] = useState<DriverFleetMonth[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [days, setDays] = useState<Record<string, DriverFleetDay[]>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState("");
  const [dayOrders, setDayOrders] = useState<DriverFleetOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<DriverFleetOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchDriverFleetDrivers(session.token).then(setDrivers).catch(() => setDrivers([]));
  }, [session.token]);

  useEffect(() => {
    setLoading(true);
    setMonths([]);
    setExpanded(null);
    setDays({});
    setSelectedDay("");
    setDayOrders([]);
    setSelectedOrder(null);
    (income ? fetchDriverIncomeSummary(session.token, startDate, endDate) : fetchDriverFleetSummary(session.token, driverId, startDate, endDate))
      .then(setMonths)
      .catch(() => setMonths([]))
      .finally(() => setLoading(false));
  }, [driverId, endDate, income, session.token, startDate]);

  async function toggleMonth(month: string) {
    if (expanded === month) { setExpanded(null); return; }
    setExpanded(month);
    if (!days[month]) {
      const rows = await (income ? fetchDriverIncomeDays(session.token, month, startDate, endDate) : fetchDriverFleetDays(session.token, month, driverId, startDate, endDate)).catch(() => []);
      setDays((current) => ({ ...current, [month]: rows }));
    }
  }

  async function openDay(date: string) {
    setSelectedDay(date);
    const rows = await (income ? fetchDriverIncomeDayOrders(session.token, date) : fetchDriverFleetDayOrders(session.token, date, driverId)).catch(() => []);
    setDayOrders(rows);
  }

  async function refreshSelectedOrder() {
    if (!selectedDay || !selectedOrder) return;
    const rows = await (income ? fetchDriverIncomeDayOrders(session.token, selectedDay) : fetchDriverFleetDayOrders(session.token, selectedDay, driverId));
    setDayOrders(rows);
    setSelectedOrder(rows.find((row) => row.deliveryId === selectedOrder.deliveryId) ?? null);
  }

  const totalOrders = months.reduce((sum, item) => sum + item.orderCount, 0);
  const totalFee = months.reduce((sum, item) => sum + item.totalFee, 0);
  const selectedDriver = drivers.find((driver) => driver.id === driverId)?.name || "全部司機";

  return (
    <section className="driver-fleet-view">
      <div className="driver-fleet-filter-row">
        <span>{income ? "所有已派訂單收入" : "車隊訂單統計"}</span>
        {!income ? <>
        <Button variant="outline" onClick={() => setFilterOpen((value) => !value)}><Filter />{selectedDriver}</Button>
        {filterOpen ? (
          <div className="driver-filter-menu">
            <button className={!driverId ? "is-selected" : ""} onClick={() => { setDriverId(""); setFilterOpen(false); }}>全部司機</button>
            {drivers.map((driver) => <button className={driver.id === driverId ? "is-selected" : ""} key={driver.id} onClick={() => { setDriverId(driver.id); setFilterOpen(false); }}>{driver.name}</button>)}
          </div>
        ) : null}</> : null}
      </div>
      <div className="driver-date-range" aria-label="訂單日期範圍">
        <CalendarDays aria-hidden="true" />
        <label>開始日期<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
        <span>至</span>
        <label>結束日期<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
        {startDate || endDate ? <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>清除</Button> : null}
      </div>
      <article className="driver-fleet-total">
        <div><span>所有已派訂單收入</span><strong>{money(totalFee)}</strong><small>包括未完成訂單</small></div>
        <div><strong>{totalOrders}</strong><span>訂單數目</span></div>
      </article>
      {loading ? <div className="driver-fleet-skeleton" aria-label="正在載入車隊訂單">{Array.from({ length: 5 }, (_, index) => <article key={index}><div><span /><span /></div><span /><span /></article>)}</div> : null}
      {!loading && months.length === 0 ? <div className="driver-empty-state"><Truck /><strong>暫時沒有車隊訂單</strong></div> : null}
      {!loading ? <div className="driver-fleet-months">
        {months.map((item) => (
          <article key={item.month} className={`driver-fleet-month${expanded === item.month ? " is-open" : ""}`}>
            <button className="driver-fleet-month-toggle" onClick={() => void toggleMonth(item.month)}>
              <div><strong>{monthLabel(item.month)}</strong><span>{item.orderCount} 張訂單</span></div>
              <strong>{money(item.totalFee)}</strong>
              <ChevronDown />
            </button>
            {expanded === item.month ? (
              <div className="driver-fleet-days">
                <Button variant="outline" size="sm" onClick={() => void exportFleetOrders(session.token, item.month, income)}><Download />匯出至 Excel</Button>
                {(days[item.month] ?? []).map((day) => (
                  <button className="driver-fleet-day" key={day.date} onClick={() => void openDay(day.date)}>
                    <strong>{dayLabel(day.date)}</strong><span>{day.orderCount} 張訂單</span><strong>{money(day.totalFee)}</strong><ExternalLink aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div> : null}
      {selectedDay ? <div className="driver-day-orders"><header><div><strong>{dayLabel(selectedDay)}</strong><span>{dayOrders.length} 張訂單</span></div><Button variant="ghost" size="icon" onClick={() => setSelectedDay("")} aria-label="關閉每日訂單"><X /></Button></header>{dayOrders.map((order) => <button key={order.deliveryId} onClick={() => setSelectedOrder(order)}><div><strong>{order.orderNumber}</strong><span>{order.address}</span></div><strong>{money(order.totalFee)}</strong><ChevronRight /></button>)}</div> : null}
      {selectedOrder ? <FleetOrderModal session={session} order={selectedOrder} onClose={() => setSelectedOrder(null)} onChanged={refreshSelectedOrder} /> : null}
    </section>
  );
}

function DistrictFeesView({ session }: { session: DriverDeliverySession }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; name: string; fee: number }>>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => { fetchDriverDistrictFees(session.token, search).then(setRows).catch(() => setRows([])); }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [search, session.token]);
  return <section className="driver-district-view"><label className="driver-order-search"><Search /><span className="sr-only">搜尋地區</span><input aria-label="搜尋地區" placeholder={t("driverDelivery.districtSearchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />{search ? <button onClick={() => setSearch("")} aria-label="清除搜尋"><X /></button> : null}</label><div className="driver-district-list">{rows.map((row) => <div key={row.id}><strong>{row.name}</strong><span>{money(Number(row.fee))}</span></div>)}</div></section>;
}

function DriverSettingsView({ session }: { session: DriverDeliverySession }) {
  const [drivers, setDrivers] = useState<DriverFleetDriver[]>([]);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() { setDrivers(await fetchDriverFleetDrivers(session.token)); }
  useEffect(() => { void refresh().catch(() => setError("暫時無法載入司機。")); }, [session.token]);
  async function add() {
    if (!name.trim()) return;
    setBusy(true); setError("");
    try { await addDriverFleetDriver(session.token, name); setName(""); setAdding(false); await refresh(); }
    catch { setError("未能新增司機，請檢查姓名是否重複。"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError("");
    try { await deleteDriverFleetDriver(session.token, id); setConfirmId(""); await refresh(); }
    catch { setError("未能刪除司機，請重試。"); }
    finally { setBusy(false); }
  }
  return <section className="driver-settings-view"><div className="driver-settings-toolbar"><div><h2>車隊司機</h2><span>{drivers.length} 位啟用司機</span></div><Button onClick={() => setAdding((value) => !value)}><Plus />新增司機</Button></div>{adding ? <div className="driver-add-driver"><label htmlFor="new-driver-name">司機名稱</label><div><input id="new-driver-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus /><Button disabled={busy || !name.trim()} onClick={() => void add()}>新增</Button><Button variant="ghost" onClick={() => { setAdding(false); setName(""); }}>取消</Button></div></div> : null}{error ? <p className="driver-settings-error" role="alert">{error}</p> : null}<div className="driver-settings-list">{drivers.map((driver) => <article key={driver.id}><strong>{driver.name}</strong>{confirmId === driver.id ? <div className="driver-delete-confirm"><span>確定刪除？</span><Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove(driver.id)}>確定</Button><Button variant="ghost" size="sm" onClick={() => setConfirmId("")}>取消</Button></div> : <Button variant="ghost" size="icon" aria-label={`刪除司機 ${driver.name}`} onClick={() => setConfirmId(driver.id)}><Trash2 /></Button>}</article>)}</div></section>;
}

function DriverDashboard({ session, onLogout }: { session: DriverDeliverySession; onLogout: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const page = driverPortalPageFromPath(location.pathname) ?? "available";
  const [methodFilter, setMethodFilter] = useState<"all" | "curbside" | "door">("all");
  const [methodMenuOpen, setMethodMenuOpen] = useState(false);
  const [rejectOrder, setRejectOrder] = useState<DriverAvailableOrder | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [workflowAction, setWorkflowAction] = useState<{type:"accept"|"pickup"|"deliver";order:DriverAvailableOrder}|null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [teamDrivers, setTeamDrivers] = useState<DriverFleetDriver[]>([]);
  useEffect(()=>{fetchDriverFleetDrivers(session.token).then(setTeamDrivers).catch(()=>setTeamDrivers([]));},[session.token]);
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [date, setDate] = useState(() => hongKongDateInputValue());
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<DriverAvailableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (page !== "available" && page !== "accepted") {
      setLoading(false);
      return;
    }
    let active = true;
    setOrders([]);
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      (page === "accepted" ? fetchDriverAcceptedOrders : fetchDriverAvailableOrders)(session.token, date, search)
        .then((items) => { if (active) setOrders(items); })
        .catch(() => { if (active) setError("暫時無法載入訂單，請重試。"); })
        .finally(() => { if (active) setLoading(false); });
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [date, page, search, session.token]);

  const visibleOrders = useMemo(() => orders.filter((order) => methodFilter === "all" || (methodFilter === "curbside" ? shippingMethodClass(order.shippingMethod) === "is-curbside" : shippingMethodClass(order.shippingMethod) === "is-door")), [methodFilter, orders]);
  const title = useMemo(() => page === "fleet" ? "車隊訂單" : page === "income" ? "合共收入" : page === "districts" ? "分區運費" : page === "settings" ? "設定" : page === "accepted" ? `已接訂單 (${visibleOrders.length})` : `可接訂單 (${visibleOrders.length})`, [page, visibleOrders.length]);

  async function confirmWorkflow() {
    if (!workflowAction) return;
    setWorkflowBusy(true);
    const { type, order } = workflowAction;
    try {
      if (type === "accept") { await acceptDriverAvailableOrder(session.token,order.deliveryId); setOrders((current)=>current.filter((item)=>item.deliveryId!==order.deliveryId)); }
      if (type === "pickup") { await pickupDriverOrder(session.token,order.deliveryId); setOrders((current)=>current.map((item)=>item.deliveryId===order.deliveryId?{...item,takenAt:new Date().toISOString()} as DriverAcceptedOrder:item)); }
      if (type === "deliver") { await deliverDriverOrder(session.token,order.deliveryId); setOrders((current)=>current.map((item)=>item.deliveryId===order.deliveryId?{...item,fulfilledAt:new Date().toISOString()} as DriverAcceptedOrder:item)); }
      setWorkflowAction(null);
    } finally { setWorkflowBusy(false); }
  }

  async function assignDriver(order: DriverAvailableOrder, driverId: string) {
    if (!driverId) return;
    await assignAcceptedOrderDriver(session.token,order.deliveryId,driverId);
    const driver=teamDrivers.find((item)=>item.id===driverId);
    setOrders((current)=>current.map((item)=>item.deliveryId===order.deliveryId?{...item,driverId,driverName:driver?.name??null} as DriverAcceptedOrder:item));
  }

  async function refreshAcceptedOrders() {
    const rows = await fetchDriverAcceptedOrders(session.token,date,search);
    setOrders(rows);
  }

  return (
    <main className="driver-portal-shell">
      <header className="driver-mobile-header">
        <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label="開啟選單"><Menu /></Button>
        <div><h1>{title}</h1></div>
        {page === "available" || page === "accepted" ? <Button variant="ghost" size="icon" onClick={() => setMethodMenuOpen((value) => !value)} aria-label="篩選接收方式"><Filter /></Button> : <span aria-hidden="true" />}
      </header>

      {methodMenuOpen && (page === "available" || page === "accepted") ? <div className="driver-method-filter"><button className={methodFilter === "all" ? "is-selected" : ""} onClick={() => { setMethodFilter("all"); setMethodMenuOpen(false); }}>全部</button><button className={methodFilter === "curbside" ? "is-selected" : ""} onClick={() => { setMethodFilter("curbside"); setMethodMenuOpen(false); }}>車邊交收</button><button className={methodFilter === "door" ? "is-selected" : ""} onClick={() => { setMethodFilter("door"); setMethodMenuOpen(false); }}>送貨上門</button></div> : null}

      {page === "available" || page === "accepted" ? <><section className="driver-date-bar" aria-label="選擇送貨日期">
        <Button variant="ghost" onClick={() => setDate(addCalendarDays(date, -1))}><ChevronLeft />前一日</Button>
        <div><CalendarDays /><strong>{formatPortalDate(date)}</strong></div>
        <Button variant="ghost" onClick={() => setDate(addCalendarDays(date, 1))}>後一日<ChevronRight /></Button>
      </section>

      <section className="driver-orders-content">
        <label className="driver-order-search">
          <Search aria-hidden="true" />
          <span className="sr-only">搜尋訂單</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("driverDelivery.searchPlaceholder")} />
          {search ? <button onClick={() => setSearch("")} aria-label="清除搜尋"><X /></button> : null}
        </label>

        {loading ? <div className="driver-empty-state">正在載入訂單…</div> : null}
        {error ? <div className="driver-empty-state is-error">{error}</div> : null}
        {!loading && !error && orders.length === 0 ? (
          <div className="driver-empty-state"><Truck /><strong>這天暫時沒有可接訂單</strong><span>可選擇其他日期再查看。</span></div>
        ) : null}
        <div className="driver-order-list">
          {visibleOrders.map((order) => (
            <article className={`driver-order-card${page === "available" || (page === "accepted" && (customerPhoneLinks((order as DriverAcceptedOrder).customerPhone) || !(order as DriverAcceptedOrder).takenAt)) ? " has-side-actions" : ""}`} key={order.deliveryId}>
              <span className={`driver-shipping-method driver-order-method-badge ${shippingMethodClass(order.shippingMethod)}`}>{shippingMethodLabel(order.shippingMethod)}</span>
              <header>
                <div><span>訂單號碼</span><strong>{order.orderNumber}</strong></div>
                <div><span>出車時間</span><strong>{order.shipOutTime || "—"}</strong></div>
                <div><span>送達時間</span><strong>{order.deliveryTime || "—"}</strong></div>
              </header>
              <div className="driver-order-body">
                <div className="driver-order-main">
                  <div className="driver-order-address"><MapPin /><div>{order.districtName ? <small>{order.districtName}</small> : null}<strong>{order.address}</strong></div></div>
                  {order.warningText ? <div className="driver-order-warning">! {order.warningText}</div> : null}
                  {page === "accepted" ? <label className="driver-assign-driver"><span>指派司機</span><select value={(order as DriverAcceptedOrder).driverId??""} disabled={Boolean((order as DriverAcceptedOrder).fulfilledAt)} onChange={(event)=>void assignDriver(order,event.target.value)}><option value="">選擇車隊司機</option>{teamDrivers.map((driver)=><option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label> : null}
                </div>
                {page === "available" ? <aside className="driver-order-contact-actions" aria-label="訂單操作"><button type="button" className="is-accept" onClick={() => setWorkflowAction({type:"accept",order})} aria-label="接單"><CircleCheck /></button><button type="button" className="is-cancel" onClick={() => setRejectOrder(order)} aria-label="取消訂單"><X /></button></aside> : null}
                {page === "accepted" && (customerPhoneLinks((order as DriverAcceptedOrder).customerPhone) || !(order as DriverAcceptedOrder).takenAt) ? <aside className="driver-order-contact-actions" aria-label="聯絡及訂單操作">{customerPhoneLinks((order as DriverAcceptedOrder).customerPhone) ? <><a href={customerPhoneLinks((order as DriverAcceptedOrder).customerPhone)!.whatsapp} target="_blank" rel="noreferrer" className="is-whatsapp" aria-label={`WhatsApp 聯絡 ${(order as DriverAcceptedOrder).customerName || "客戶"}`}><MessageCircle /></a><a href={`tel:${customerPhoneLinks((order as DriverAcceptedOrder).customerPhone)!.telephone}`} className="is-phone" aria-label={`致電 ${(order as DriverAcceptedOrder).customerName || "客戶"}`}><Phone /></a></> : null}{!(order as DriverAcceptedOrder).takenAt ? <button type="button" className="is-cancel" onClick={() => setRejectOrder(order)} aria-label="取消送貨訂單"><X /></button> : null}</aside> : null}
              </div>
              {page === "accepted" && expandedOrderId===order.deliveryId ? <div className="driver-accepted-details"><div className="driver-order-contact">{(order as DriverAcceptedOrder).customerName?<span><UserRound />{(order as DriverAcceptedOrder).customerName}</span>:null}{(order as DriverAcceptedOrder).customerPhone?<a href={`tel:${(order as DriverAcceptedOrder).customerPhone}`}><Phone />{(order as DriverAcceptedOrder).customerPhone}</a>:null}</div><div className="driver-order-fees"><span>地區運費 <strong>{money((order as DriverAcceptedOrder).basicFee)}</strong></span><span>總運費 <strong>{money((order as DriverAcceptedOrder).totalFee)}</strong></span></div><div className="driver-delivery-progress"><button className={!((order as DriverAcceptedOrder).takenAt)?"is-current":"is-complete"} disabled><span>待取貨</span></button><ChevronRight /><button className={(order as DriverAcceptedOrder).fulfilledAt?"is-complete":(order as DriverAcceptedOrder).takenAt?"is-current":""} disabled={Boolean((order as DriverAcceptedOrder).takenAt)} onClick={()=>setWorkflowAction({type:"pickup",order})}><span>已取貨</span>{(order as DriverAcceptedOrder).takenAt?<small>{formatStatusTime((order as DriverAcceptedOrder).takenAt)}</small>:null}</button><ChevronRight /><button className={(order as DriverAcceptedOrder).fulfilledAt?"is-complete":""} disabled={!(order as DriverAcceptedOrder).takenAt||Boolean((order as DriverAcceptedOrder).fulfilledAt)} onClick={()=>setWorkflowAction({type:"deliver",order})}><span>已送達</span>{(order as DriverAcceptedOrder).fulfilledAt?<small>{formatStatusTime((order as DriverAcceptedOrder).fulfilledAt)}</small>:null}</button></div>{(order as DriverAcceptedOrder).fulfilledAt?<AcceptedOrderTools session={session} order={order as DriverAcceptedOrder} onChanged={refreshAcceptedOrders} />:null}</div>:null}
              {page === "accepted" ? <div className={`driver-card-expand${expandedOrderId===order.deliveryId?" is-open":""}`} role="button" tabIndex={0} onClick={()=>setExpandedOrderId((value)=>value===order.deliveryId?"":order.deliveryId)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setExpandedOrderId((value)=>value===order.deliveryId?"":order.deliveryId);}}}><span>{expandedOrderId===order.deliveryId?"收起":"點擊展開更多"}</span><ChevronDown /></div>:null}
            </article>
          ))}
        </div>
      </section></> : page === "fleet" ? <FleetOrdersView session={session} /> : page === "income" ? <FleetOrdersView session={session} income /> : page === "districts" ? <DistrictFeesView session={session} /> : <DriverSettingsView session={session} />}
      <DriverDrawer open={drawerOpen} teamName={session.teamName} page={page} onNavigate={(nextPage) => navigate(DRIVER_PORTAL_PATHS[nextPage])} onClose={() => setDrawerOpen(false)} onLogout={onLogout} />
      {rejectOrder ? <div className="driver-confirm-layer" role="alertdialog" aria-modal="true" aria-labelledby="reject-order-title"><button className="driver-confirm-scrim" aria-label="返回" onClick={() => setRejectOrder(null)} /><article><header><h2 id="reject-order-title">{page === "accepted" ? "確定取消司機訂單" : "重要提醒"}</h2></header><div>{page === "accepted" ? <><strong>確定完成後</strong><p>此訂單將不會顯示於司機版面，直至再派車隊。</p><p>是否確定取消送貨訂單？</p></> : <><strong>你確定要拒絕訂單嗎？</strong><p>我們會另行安排其他車隊運送訂單 {rejectOrder.orderNumber}。</p></>}</div><footer><Button variant="outline" onClick={() => setRejectOrder(null)}>取消</Button><Button variant="destructive" disabled={rejecting} onClick={() => { setRejecting(true); void rejectDriverAvailableOrder(session.token,rejectOrder.deliveryId).then(() => { setOrders((current) => current.filter((item) => item.deliveryId !== rejectOrder.deliveryId)); setRejectOrder(null); }).finally(() => setRejecting(false)); }}>{rejecting ? "處理中…" : page === "accepted" ? "確定" : "確認拒絕訂單"}</Button></footer></article></div> : null}
      {workflowAction ? <div className="driver-confirm-layer" role="alertdialog" aria-modal="true"><button className="driver-confirm-scrim" aria-label="返回" onClick={()=>setWorkflowAction(null)} /><article><header><h2>{workflowAction.type==="pickup"?"取貨確認":workflowAction.type==="deliver"?"送達確認":"接單確認"}</h2></header><div><strong>{workflowAction.type==="pickup"?"你確定已取貨嗎？":workflowAction.type==="deliver"?"你確定訂單已送達嗎？":`確定接受訂單 ${workflowAction.order.orderNumber}？`}</strong><p>{workflowAction.type==="pickup"?"一旦確認不能返回待取貨狀態。":workflowAction.type==="deliver"?"一旦確認不能返回已取貨狀態。":"訂單將移至已接訂單。"}</p>{workflowAction.type!=="accept"?<div className="driver-confirm-time"><span>確認後記錄時間</span><strong>{formatStatusTime(new Date().toISOString())}</strong><Clock3 aria-hidden="true" /></div>:null}</div><footer><Button variant="outline" onClick={()=>setWorkflowAction(null)}>返回</Button><Button disabled={workflowBusy} onClick={()=>void confirmWorkflow()}>{workflowBusy?"處理中…":"確認"}</Button></footer></article></div>:null}
    </main>
  );
}

export function DriverDeliveryPage() {
  const [session, setSession] = useState<DriverDeliverySession | null>(() => restoreDriverDeliverySession());
  const location = useLocation();

  async function logout() {
    const token = session?.token;
    setSession(null);
    await logoutDriverDelivery(token).catch(() => undefined);
  }

  if (!driverPortalPageFromPath(location.pathname)) {
    return <Navigate to={DRIVER_PORTAL_PATHS.available} replace />;
  }

  return session ? <DriverDashboard session={session} onLogout={logout} /> : <DriverLogin onLogin={setSession} />;
}
