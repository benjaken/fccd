import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  ReceiptText,
  Search,
  Truck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchCustomerSelfServiceOrder,
  loginCustomerSelfService,
  logoutCustomerSelfService,
  restoreCustomerSelfService,
  type CustomerSelfServiceOrderDetail,
  type CustomerSelfServiceOrderSummary,
  type CustomerSelfServiceSession,
} from "@/lib/customer-self-service";
import {
  createCustomerReceiptPdf,
  downloadCustomerReceipt,
} from "@/lib/customer-receipt-pdf";
import {
  FOOD_CHANNEL_CATERING_LOGO_PATH,
  getBrandContactEmail,
  getBrandLogoAlt,
  getDocumentLogoPath,
} from "@/lib/brand-logo";
import "@/components/customer-self-service.css";

type LoginFn = typeof loginCustomerSelfService;
type RestoreFn = typeof restoreCustomerSelfService;
type DetailFn = typeof fetchCustomerSelfServiceOrder;
type LogoutFn = typeof logoutCustomerSelfService;
type PdfFn = typeof createCustomerReceiptPdf;

const DEMO_SESSION: CustomerSelfServiceSession = {
  token: "local-design-preview",
  expiresAt: "2099-01-01T00:00:00Z",
  maskedPhone: "****9987",
  maskedEmail: "v*****@redacademy.com.hk",
  orders: [
    { id: "demo-1", orderNumber: "B-1247", orderDate: "2025-08-24T00:00:00+08:00", deliveryDate: "2025-08-24T00:00:00+08:00", grandTotal: 1720, currency: "HKD" },
    { id: "demo-2", orderNumber: "B-1248", orderDate: "2025-08-24T00:00:00+08:00", deliveryDate: "2025-08-24T00:00:00+08:00", grandTotal: 2480, currency: "HKD" },
    { id: "demo-3", orderNumber: "B-1554", orderDate: "2026-08-31T00:00:00+08:00", deliveryDate: "2026-08-31T00:00:00+08:00", grandTotal: 1980, currency: "HKD" },
  ],
};

const DEMO_DETAIL: CustomerSelfServiceOrderDetail = {
  id: "demo-1",
  orderNumber: "B-1247",
  orderDate: "2025-08-24T00:00:00+08:00",
  deliveryDate: "2025-08-24T00:00:00+08:00",
  deliveryTime: "11:30 - 12:00",
  customerName: "Vivian Ip",
  companyName: "Red Academy",
  phoneA: "60879987",
  phoneB: null,
  email: "vivian.ip@redacademy.com.hk",
  maskedPhoneA: "****9987",
  maskedPhoneB: null,
  maskedEmail: "v*****@redacademy.com.hk",
  address: "柴灣青年廣場香港青年協會賽馬會創意空間地下大堂",
  shippingMethod: "車邊交收",
  deliveryStatus: "待取貨",
  factoryArranged: true,
  fleetArranged: true,
  currency: "HKD",
  grandTotal: 1720,
  outstanding: 0,
  paid: true,
  channelName: "HK Lunch Box",
  channelEmail: "sales@foodchannels-catering.com",
  lines: [
    { id: "line-1", name: "（雙格）椒鹽豬扒飯", content: null, quantity: 10, unitPrice: 60, totalPrice: 600, isAddon: false },
    { id: "line-2", name: "（雙格）菠蘿酸甜咕嚕肉飯", content: null, quantity: 10, unitPrice: 60, totalPrice: 600, isAddon: false },
    { id: "line-3", name: "（雙格）黑松露雜菌意粉", content: null, quantity: 7, unitPrice: 60, totalPrice: 420, isAddon: false },
    { id: "line-4", name: "烏龍茶（9包）", content: null, quantity: 1, unitPrice: 0, totalPrice: 0, isAddon: false },
    { id: "line-5", name: "檸檬茶（9包）", content: null, quantity: 1, unitPrice: 0, totalPrice: 0, isAddon: false },
    { id: "line-6", name: "蜂蜜綠茶（9包）", content: null, quantity: 1, unitPrice: 0, totalPrice: 0, isAddon: false },
  ],
  payments: [{ id: "payment-1", amount: 1720, paymentAt: "2025-08-22T00:00:00+08:00", method: "Credit card", receiptReference: "REC/B-124701" }],
};

function portalDate(value: string | null | undefined, weekday = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(weekday ? { weekday: "short" as const } : {}),
  }).format(date);
}

function money(value: number, currency = "HKD") {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function customerLoginError(error: unknown) {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : String((error as { message?: unknown } | null)?.message || "").toLowerCase();
  if (message.includes("lookup_rate_limited")) {
    return "查詢次數過多，請於 15 分鐘後再試。";
  }
  if (message.includes("orders_not_found") || message.includes("invalid_lookup_details")) {
    return "找不到符合資料的訂單，請確認電話號碼及下單電郵是否正確。";
  }
  return "自助查詢服務暫時未能連線，請稍後再試或以 WhatsApp 聯絡我們。";
}

function BrandLogo({ detail }: { detail?: CustomerSelfServiceOrderDetail | null }) {
  const values = detail ? [detail.channelName, detail.orderNumber] : [];
  return (
    <img
      className="self-service-logo"
      src={detail ? getDocumentLogoPath(...values) : FOOD_CHANNEL_CATERING_LOGO_PATH}
      alt={detail ? getBrandLogoAlt(...values) : "Food Channel Catering"}
    />
  );
}

function LoginView({ onLogin, login }: { onLogin: (value: CustomerSelfServiceSession) => void; login: LoginFn }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try { onLogin(await login(phone, email)); }
    catch (submitError) { setError(customerLoginError(submitError)); }
    finally { setBusy(false); }
  }

  return (
    <main className="self-service-login-shell">
      <section className="self-service-login-wrap" aria-labelledby="self-service-title">
        <BrandLogo />
        <div className="self-service-login-heading">
          <span>客戶自助服務</span>
          <h1 id="self-service-title">查詢你的到會訂單</h1>
        </div>
        <form className="self-service-login-card" onSubmit={submit}>
          <label htmlFor="self-service-phone"><span><Phone />電話號碼</span>
            <input id="self-service-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("customerSelfService.phonePlaceholder")} autoFocus />
          </label>
          <label htmlFor="self-service-email"><span><Mail />電郵地址</span>
            <input id="self-service-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("customerSelfService.emailPlaceholder")} />
          </label>
          {error ? <p className="self-service-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={busy || !phone.trim() || !email.trim()}>
            {busy ? <><LoaderCircle className="self-service-spin" />查詢中…</> : <><Search />查詢訂單</>}
          </Button>
          <small>你的資料只會用作核對訂單身份。</small>
        </form>
      </section>
    </main>
  );
}

function PortalHeader({ session, onLogout, detail }: { session: CustomerSelfServiceSession; onLogout: () => void; detail?: CustomerSelfServiceOrderDetail | null }) {
  return (
    <header className="self-service-header">
      <BrandLogo detail={detail} />
      <div className="self-service-account">
        <span><Phone />{session.maskedPhone}</span>
        <span><Mail />{session.maskedEmail}</span>
        <Button variant="outline" size="sm" onClick={onLogout}><LogOut />離開</Button>
      </div>
    </header>
  );
}

function OrdersView({ session, onSelect, onLogout }: { session: CustomerSelfServiceSession; onSelect: (order: CustomerSelfServiceOrderSummary) => void; onLogout: () => void }) {
  return (
    <main className="self-service-shell">
      <PortalHeader session={session} onLogout={onLogout} />
      <section className="self-service-list-intro">
        <span>你的訂單</span>
        <h1>訂單列表</h1>
        <p>共找到 {session.orders.length} 張訂單，點擊訂單可查看內容及送貨安排。</p>
      </section>
      <section className="self-service-order-list" aria-label={`訂單列表，共 ${session.orders.length} 張`}>
        <div className="self-service-order-list-head"><span>訂單／日期</span><span>送貨日期</span><span>總額</span><span /></div>
        {session.orders.map((order) => (
          <button type="button" key={order.id} onClick={() => onSelect(order)}>
            <span><strong>{order.orderNumber}</strong><small>{portalDate(order.orderDate)}</small></span>
            <span><CalendarDays />{portalDate(order.deliveryDate)}</span>
            <strong>{money(order.grandTotal, order.currency)}</strong>
            <ChevronRight />
          </button>
        ))}
      </section>
    </main>
  );
}

function StatusBadges({ order }: { order: CustomerSelfServiceOrderDetail }) {
  return <div className="self-service-statuses">
    <span className={order.paid ? "is-success" : "is-pending"}><Check />{order.paid ? "已完成付款" : "付款處理中"}</span>
    {order.factoryArranged ? <span className="is-success"><PackageCheck />已安排製作</span> : null}
    {order.fleetArranged ? <span className="is-info"><Truck />已安排車隊</span> : null}
    {order.deliveryStatus ? <span className="is-neutral">{order.deliveryStatus}</span> : null}
  </div>;
}

function ReceiptDocument({ order, documentRef }: { order: CustomerSelfServiceOrderDetail; documentRef: RefObject<HTMLDivElement | null> }) {
  const paymentTotal = order.payments.reduce((total, payment) => total + payment.amount, 0);
  const payment = order.payments[0];
  const contact = [order.companyName, order.customerName].filter(Boolean).join(" / ") || "Customer";
  const brandValues = [order.channelName, order.orderNumber];
  return (
    <div className="customer-receipt-document" ref={documentRef}>
      <header>
        <div><strong>Food Channels Limited</strong><span>Unit D-G, 5/F, Wah Lik Industrial Centre, 459-469 Castle Peak Road, Tsuen Wan N.T.</span></div>
      </header>
      <section className="customer-receipt-meta">
        <span>No.:</span><strong>{payment?.receiptReference || `REC/${order.orderNumber}`}</strong>
        <span>Delivery Date:</span><strong>{portalDate(order.deliveryDate)}</strong>
        <span>Contact Person:</span><strong>{contact} ({order.phoneA || order.phoneB || "—"})</strong>
        <span>Email:</span><strong>{order.email || "—"}</strong>
        <span>Delivery Address:</span><strong>{order.address || "—"}</strong>
      </section>
      <h2>Official Receipt</h2>
      <section className="customer-receipt-description">
        <strong>Description</strong>
        <div><span>{order.channelName || "Catering"}　{order.orderNumber}</span><span>{money(order.grandTotal, order.currency)}</span></div>
      </section>
      <section className="customer-receipt-payment">
        <span>Total Amount:</span><strong>{money(order.grandTotal, order.currency)}</strong>
        <span>Payment Method:</span><strong>{payment?.method || "—"}</strong>
        <span>Payment Date:</span><strong>{portalDate(payment?.paymentAt)}</strong>
        {paymentTotal && paymentTotal !== order.grandTotal ? <><span>Amount Received:</span><strong>{money(paymentTotal, order.currency)}</strong></> : null}
      </section>
      <section className="customer-receipt-signature">
        <span>For and on behalf of</span>
        <strong>Food Channels Limited</strong>
        <img src="/assets/fc-ltd-stamp.avif" alt="Food Channels Limited company chop" />
        <span>Authorized Signature &amp; Co. Chop</span>
      </section>
      <footer><span>www.foodchannels-catering.com</span><span>(+852) 2185 7373</span><span>{getBrandContactEmail(order.channelEmail, ...brandValues)}</span></footer>
    </div>
  );
}

function ReceiptPreview({ order, onClose, createPdf }: { order: CustomerSelfServiceOrderDetail; onClose: () => void; createPdf: PdfFn }) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [download, setDownload] = useState<{ blob: Blob; filename: string } | null>(null);

  async function generate(autoDownload: boolean) {
    if (!documentRef.current) return;
    setBusy(true); setError("");
    try {
      const file = await createPdf(documentRef.current, order.orderNumber);
      setDownload(file);
      if (autoDownload) downloadCustomerReceipt(file.blob, file.filename);
    } catch (pdfError) {
      console.error("Customer receipt PDF generation failed", pdfError);
      const detail = import.meta.env.DEV && pdfError instanceof Error
        ? `（${pdfError.message}）`
        : "";
      setError(`暫時無法建立收據 PDF，請稍後再試。${detail}`);
    }
    finally { setBusy(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void generate(true), 80); return () => window.clearTimeout(timer); }, []);

  return (
    <div className="self-service-receipt-layer" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
      <button className="self-service-receipt-scrim" onClick={onClose} aria-label="關閉收據預覽" />
      <article className="self-service-receipt-modal">
        <header><div><span>PDF 預覽</span><h2 id="receipt-preview-title">收據 {order.orderNumber}</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉"><X /></Button></header>
        <div className="self-service-receipt-preview"><ReceiptDocument order={order} documentRef={documentRef} /></div>
        <footer>
          {busy ? <span><LoaderCircle className="self-service-spin" />正在建立並下載 PDF…</span> : error ? <span className="is-error">{error}</span> : <span><Check />PDF 已開始下載</span>}
          <Button variant="outline" onClick={() => download && downloadCustomerReceipt(download.blob, download.filename)} disabled={!download}><Download />再次下載</Button>
        </footer>
      </article>
    </div>
  );
}

function DetailView({ session, order, onBack, onLogout, createPdf }: { session: CustomerSelfServiceSession; order: CustomerSelfServiceOrderDetail; onBack: () => void; onLogout: () => void; createPdf: PdfFn }) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const itemTotal = useMemo(() => order.lines.reduce((total, line) => total + line.totalPrice, 0), [order.lines]);
  const addOnClosed = order.deliveryDate ? new Date(order.deliveryDate).getTime() - Date.now() < 48 * 60 * 60 * 1000 : false;
  return (
    <main className="self-service-shell self-service-detail-shell">
      <PortalHeader session={session} onLogout={onLogout} detail={order} />
      <button type="button" className="self-service-back" onClick={onBack}><ArrowLeft />返回訂單列表</button>
      <section className="self-service-detail-title">
        <div><span>訂單</span><h1>{order.orderNumber}</h1></div>
        <StatusBadges order={order} />
        {order.payments.length ? <Button onClick={() => setReceiptOpen(true)}><ReceiptText />預覽並下載收據</Button> : null}
      </section>
      {addOnClosed ? <div className="self-service-addon-note">加單時限已過／已進行加單</div> : null}
      <section className="self-service-content-card">
        <header><div><span>訂單內容</span><h2>{order.lines.length} 項食品</h2></div><strong>{money(order.grandTotal, order.currency)}</strong></header>
        <div className="self-service-line-list">
          {order.lines.map((line, index) => <article key={line.id}>
            <span>{index + 1}</span>
            <div><strong>{line.name}</strong>{line.content && line.content !== line.name ? <small>{line.content}</small> : null}{line.isAddon ? <em>加單項目</em> : null}</div>
            <dl><div><dt>單價</dt><dd>{money(line.unitPrice, order.currency)}</dd></div><div><dt>數量</dt><dd>{line.quantity}</dd></div><div><dt>小計</dt><dd>{money(line.totalPrice, order.currency)}</dd></div></dl>
          </article>)}
        </div>
        <footer><span>食品小計</span><strong>{money(itemTotal, order.currency)}</strong><span>訂單總額</span><strong>{money(order.grandTotal, order.currency)}</strong></footer>
      </section>
      <section className="self-service-delivery-card">
        <header><MapPin /><div><span>送貨資料</span><h2>{order.shippingMethod || "送貨安排"}</h2></div></header>
        <div className="self-service-delivery-grid">
          <div><span>日期</span><strong>{portalDate(order.deliveryDate, true)}</strong></div>
          <div><span>時間</span><strong>{order.deliveryTime || "待確認"}</strong></div>
          <div><span>收貨人</span><strong>{[order.companyName, order.customerName].filter(Boolean).join(" / ") || "—"}</strong></div>
          <div><span>聯絡電話</span><strong>{[order.maskedPhoneA, order.maskedPhoneB].filter(Boolean).join(" / ")}</strong></div>
          <div className="is-wide"><span>地址</span><strong>{order.address || "—"}</strong></div>
        </div>
      </section>
      {receiptOpen ? <ReceiptPreview order={order} createPdf={createPdf} onClose={() => setReceiptOpen(false)} /> : null}
    </main>
  );
}

export function CustomerSelfServicePage({
  login = loginCustomerSelfService,
  restore = restoreCustomerSelfService,
  loadDetail = fetchCustomerSelfServiceOrder,
  logout = logoutCustomerSelfService,
  createPdf = createCustomerReceiptPdf,
}: { login?: LoginFn; restore?: RestoreFn; loadDetail?: DetailFn; logout?: LogoutFn; createPdf?: PdfFn }) {
  const demoMode = import.meta.env.DEV
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demo") === "1";
  const [session, setSession] = useState<CustomerSelfServiceSession | null>(null);
  const [detail, setDetail] = useState<CustomerSelfServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    if (demoMode) {
      setSession(DEMO_SESSION);
      setLoading(false);
      return;
    }
    restore().then(setSession).finally(() => setLoading(false));
  }, [demoMode, restore]);

  async function selectOrder(order: CustomerSelfServiceOrderSummary) {
    if (!session) return;
    setLoading(true); setDetailError("");
    try { setDetail(demoMode ? { ...DEMO_DETAIL, id: order.id, orderNumber: order.orderNumber } : await loadDetail(session.token, order.id)); }
    catch { setDetailError("暫時無法載入訂單，請重新查詢。"); }
    finally { setLoading(false); }
  }

  async function leave() {
    if (session) await logout(session.token).catch(() => undefined);
    setDetail(null); setSession(null);
  }

  if (loading && !session) return <main className="self-service-loading"><LoaderCircle className="self-service-spin" /><span>正在載入客戶自助服務…</span></main>;
  if (!session) return <LoginView login={login} onLogin={setSession} />;
  if (detailError) return <main className="self-service-loading"><p role="alert">{detailError}</p><Button onClick={() => setDetailError("")}>返回訂單列表</Button></main>;
  if (loading) return <main className="self-service-loading"><LoaderCircle className="self-service-spin" /><span>正在載入訂單…</span></main>;
  if (detail) return <DetailView session={session} order={detail} onBack={() => setDetail(null)} onLogout={() => void leave()} createPdf={createPdf} />;
  return <OrdersView session={session} onSelect={(order) => void selectOrder(order)} onLogout={() => void leave()} />;
}
