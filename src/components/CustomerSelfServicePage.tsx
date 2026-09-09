import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  Minus,
  PackageCheck,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Truck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { PdfAutoResizeTextarea } from "@/components/PdfAutoResizeTextarea";
import {
  captureCustomerAddonPaypalCheckout,
  cancelCustomerAddonPaypalCheckout,
  createCustomerAddonPaypalCheckout,
  fetchCustomerSelfServiceAddonOptions,
  fetchCustomerSelfServiceOrder,
  loginCustomerSelfService,
  logoutCustomerSelfService,
  restoreCustomerSelfService,
  type CustomerSelfServiceOrderDetail,
  type CustomerSelfServiceAddonOptions,
  type CustomerSelfServiceOrderSummary,
  type CustomerSelfServiceSession,
} from "@/lib/customer-self-service";
import { printPdf } from "@/lib/print-pdf";
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
type AddonOptionsFn = typeof fetchCustomerSelfServiceAddonOptions;
type LogoutFn = typeof logoutCustomerSelfService;
type PrintReceiptFn = typeof printPdf;

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
  shippingFee: 100,
  grandTotal: 1720,
  outstanding: 0,
  paid: true,
  channelName: "HK Lunch Box",
  channelEmail: "sales@foodchannels-catering.com",
  shopifyStoreDomain: null,
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

const DEMO_ADDON_OPTIONS: CustomerSelfServiceAddonOptions = {
  canAddOn: true,
  reason: null,
  cutoffAt: "2026-08-30T15:00:00+08:00",
  hasAddOn: false,
  items: [
    { id: "addon-1", productId: "addon-product-1", sku: "CSN046-12", name: "唐揚炸雞塊（12件）", price: 128, minQuantity: 1, maxQuantity: 10 },
    { id: "addon-2", productId: "addon-product-2", sku: "CDE001-12", name: "朱古力布朗尼（12件）", price: 118, minQuantity: 1, maxQuantity: 10 },
    { id: "addon-3", productId: "addon-product-3", sku: "CDR001-8", name: "可口可樂（8罐）", price: 58, minQuantity: 1, maxQuantity: 10 },
    { id: "addon-4", productId: "addon-product-4", sku: "CDR005-6", name: "道地極品烏龍茶（6包）", price: 28, minQuantity: 1, maxQuantity: 10 },
  ],
};
const loadDemoAddonOptions: AddonOptionsFn = async () => DEMO_ADDON_OPTIONS;

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

function receiptDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${Number(part("day"))}/${Number(part("month"))}/${part("year")}`;
}

function receiptMoney(value: number, decimals = false) {
  return `$${value.toLocaleString("en-HK", {
    minimumFractionDigits: decimals ? 2 : Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function customerOrderLineTotal(line: CustomerSelfServiceOrderDetail["lines"][number]) {
  const totalPrice = Number(line.totalPrice);
  return Number.isFinite(totalPrice) ? totalPrice : line.unitPrice * line.quantity;
}

function customerOrderShippingFee(order: CustomerSelfServiceOrderDetail, itemTotal: number) {
  const returnedShippingFee = Number(order.shippingFee);
  return Number.isFinite(returnedShippingFee) && returnedShippingFee > 0
    ? returnedShippingFee
    : Math.max(order.grandTotal - itemTotal, 0);
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

function ReceiptDocument({ order, documentRef, scale = 1 }: { order: CustomerSelfServiceOrderDetail; documentRef?: RefObject<HTMLDivElement | null>; scale?: number }) {
  const subtotal = order.lines.reduce((total, line) => total + customerOrderLineTotal(line), 0);
  const shippingFee = customerOrderShippingFee(order, subtotal);
  const grandTotal = subtotal + shippingFee;
  const brandValues = [order.channelName, order.shopifyStoreDomain, order.orderNumber];
  const paymentInformation = order.outstanding > 0
    ? `Outstanding: ${receiptMoney(order.outstanding, true)}`
    : order.outstanding < 0
      ? `Overpaid: ${receiptMoney(Math.abs(order.outstanding), true)}`
      : "Payment Status: Paid";
  return (
    <div className="quote-pdf-sheet receipt-pdf-sheet self-service-receipt-document" ref={documentRef} aria-label="唯讀收據 PDF" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <header className="receipt-pdf-letterhead">
        <img src={getDocumentLogoPath(...brandValues)} alt={getBrandLogoAlt(...brandValues)} />
        <div className="receipt-pdf-document-heading">
          <h1>RECEIPT</h1>
          <input aria-label="收據編號" readOnly tabIndex={-1} value={`REC/${order.orderNumber}`} />
        </div>
      </header>

      <div className="receipt-pdf-meta-grid self-service-receipt-meta-grid">
        <div className="receipt-pdf-customer-company">
          <label>Customer Name:</label><input aria-label="Customer Name" readOnly tabIndex={-1} value={order.customerName || ""} />
          <label>Company Name:</label><input aria-label="Company Name" readOnly tabIndex={-1} value={order.companyName || ""} />
        </div>
        <label>Invoice Date:</label><input aria-label="Invoice Date" readOnly tabIndex={-1} value={receiptDate(order.orderDate)} />
        <label>Contact Person:</label><input aria-label="Contact Person" readOnly tabIndex={-1} value={[order.phoneA, order.phoneB].filter(Boolean).join(" / ")} />
        <label>Delivery Date:</label><input aria-label="Delivery Date" readOnly tabIndex={-1} value={receiptDate(order.deliveryDate)} />
        <label>Delivery Address:</label><PdfAutoResizeTextarea aria-label="Delivery Address" readOnly tabIndex={-1} rows={1} value={order.address || ""} />
        <label>Delivery Time:</label><input aria-label="Delivery Time" readOnly tabIndex={-1} value={order.deliveryTime || ""} />
      </div>

      <div className="receipt-pdf-table-wrap">
        <table className="receipt-pdf-table">
          <thead><tr><th aria-label="序號" /><th>Description</th><th>Unit Price</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>{order.lines.map((line, index) => {
            const unitPrice = line.unitPrice !== 0 || !line.totalPrice || line.quantity === 0
              ? line.unitPrice
              : line.totalPrice / line.quantity;
            return <tr key={line.id}>
              <td>{index + 1}</td>
              <td><PdfAutoResizeTextarea aria-label={`產品 ${index + 1}`} readOnly tabIndex={-1} rows={1} value={line.name || line.content || ""} /></td>
              <td><span className="receipt-pdf-price-input"><span aria-hidden="true">$</span><input aria-label={`單價 ${index + 1}`} readOnly tabIndex={-1} inputMode="decimal" size={Math.max(String(unitPrice).length, 1)} value={String(unitPrice)} /></span></td>
              <td><input aria-label={`數量 ${index + 1}`} readOnly tabIndex={-1} inputMode="decimal" value={String(line.quantity)} /></td>
              <td>{receiptMoney(customerOrderLineTotal(line))}</td>
            </tr>;
          })}</tbody>
          <tfoot>
            <tr><td colSpan={4}>Subtotal:</td><td>{receiptMoney(subtotal)}</td></tr>
            <tr><td colSpan={4}>Delivery Fee</td><td><span className="receipt-pdf-price-input"><span aria-hidden="true">$</span><input aria-label="運費" readOnly tabIndex={-1} inputMode="decimal" size={Math.max(String(shippingFee).length, 1)} value={String(shippingFee)} /></span></td></tr>
            <tr><td colSpan={4}>Grand Total:</td><td>{receiptMoney(grandTotal)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className="receipt-pdf-trailing" aria-label="付款資料及公司蓋章">
        <section className="receipt-pdf-payment">
          <strong>Payment information:</strong>
          <input className="receipt-pdf-payment-summary-input" aria-label="付款資料" readOnly tabIndex={-1} size={Math.max(paymentInformation.length, 1)} value={paymentInformation} />
          {order.payments.map((payment, index) => {
            const suffix = order.payments.length > 1 ? ` ${index + 1}` : "";
            return <div className="receipt-pdf-payment-record" key={payment.id}>
              <label><span>{`Payment Method${suffix}:`}</span><input aria-label={`付款方式${suffix}`} readOnly tabIndex={-1} size={Math.max((payment.method || "").length, 1)} value={payment.method || ""} /><span className="receipt-pdf-payment-amount"><span aria-hidden="true">$</span><input aria-label={`支付金額${suffix}`} readOnly tabIndex={-1} inputMode="decimal" size={Math.max(receiptMoney(payment.amount, true).length - 1, 1)} value={receiptMoney(payment.amount, true).slice(1)} /></span></label>
              <label><span>{`Payment Date${suffix}:`}</span><input aria-label={`付款日期${suffix}`} readOnly tabIndex={-1} size={Math.max(receiptDate(payment.paymentAt).length, 1)} value={receiptDate(payment.paymentAt)} /></label>
            </div>;
          })}
        </section>
      </div>
      <div className="receipt-pdf-trailing receipt-pdf-trailing-signature">
        <section className="receipt-pdf-signature" aria-label="公司簽署">
          <span>For and on behalf of</span>
          <strong>Food Channels Limited</strong>
          <img src="/assets/fc-ltd-stamp.avif" alt="Food Channels Limited 公司蓋印" />
          <span>Authorized Signature &amp; Co. Chop</span>
        </section>
      </div>
      <footer className="receipt-pdf-page-footer">
        <span>5D-G Wah Lik Ind Ctr Tsuen Wan</span>
        <span>(+852) 2185 7373 / 5396 4335</span>
        <span>{getBrandContactEmail(order.channelEmail, ...brandValues)}</span>
        <span>第1頁 | 共1頁</span>
      </footer>
    </div>
  );
}

function ReceiptPreview({ order, onClose, printReceipt }: { order: CustomerSelfServiceOrderDetail; onClose: () => void; printReceipt: PrintReceiptFn }) {
  const documentRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number; scale: number } | null>(null);

  useEffect(() => {
    const preview = previewRef.current;
    const document = documentRef.current;
    if (!preview || !document) return;
    const resize = () => {
      const style = window.getComputedStyle(preview);
      const availableWidth = preview.clientWidth
        - Number.parseFloat(style.paddingLeft || "0")
        - Number.parseFloat(style.paddingRight || "0");
      const pageWidth = document.offsetWidth;
      const pageHeight = document.offsetHeight;
      if (availableWidth <= 0 || pageWidth <= 0 || pageHeight <= 0) return;
      const scale = Math.min(1, availableWidth / pageWidth);
      setPreviewSize({ width: pageWidth * scale, height: pageHeight * scale, scale });
    };
    resize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  const printDocument = typeof document !== "undefined"
    ? createPortal(
        <div className="self-service-receipt-print-root" data-testid="self-service-receipt-print-root" aria-hidden="true">
          <ReceiptDocument order={order} />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
    <div className="self-service-receipt-layer" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
      <button className="self-service-receipt-scrim" onClick={onClose} aria-label="關閉收據預覽" />
      <article className="self-service-receipt-modal">
        <header><div><span>PDF 預覽</span><h2 id="receipt-preview-title">收據 {order.orderNumber}</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉"><X /></Button></header>
        <div className="self-service-receipt-preview" ref={previewRef}>
          <div
            className="self-service-receipt-stage"
            style={previewSize ? { width: previewSize.width, height: previewSize.height } : undefined}
          >
            <ReceiptDocument order={order} documentRef={documentRef} scale={previewSize?.scale ?? 1} />
          </div>
        </div>
        <footer>
          <span><Check />使用瀏覽器列印並可另存為 PDF</span>
          <Button variant="outline" onClick={() => printReceipt("收據", `REC/${order.orderNumber}`)}><Download />下載收據</Button>
        </footer>
      </article>
    </div>
    {printDocument}
    </>
  );
}

function addonReason(options: CustomerSelfServiceAddonOptions) {
  if (options.reason === "block_date") return "此送貨日期暫停接受加單，如有查詢請透過 WhatsApp 聯絡我們。";
  if (options.reason === "cutoff_passed") return "加單時限已過。加單截止時間為送貨前一天下午 3 點。";
  if (options.reason === "order_closed") return "此訂單已完成或取消，不能再加單。";
  if (options.reason === "delivery_date_missing") return "訂單尚未確定送貨日期，暫時不能加單。";
  if (options.reason === "no_products") return "此品牌目前沒有可供加單的商品。";
  return "此訂單暫時不能加單。";
}

function AddonPanel({
  open,
  session,
  order,
  options,
  onClose,
}: {
  open: boolean;
  session: CustomerSelfServiceSession;
  order: CustomerSelfServiceOrderDetail;
  options: CustomerSelfServiceAddonOptions;
  onClose: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = options.items.filter((item) => (quantities[item.productId] ?? 0) > 0);
  const total = selected.reduce((sum, item) => sum + item.price * quantities[item.productId], 0);

  function setQuantity(productId: string, quantity: number, min: number, max: number) {
    const next = quantity <= 0 ? 0 : Math.min(max, Math.max(min, Math.trunc(quantity)));
    setQuantities((current) => ({ ...current, [productId]: next }));
  }

  async function pay() {
    if (!selected.length || busy) return;
    setBusy(true); setError("");
    try {
      const checkout = await createCustomerAddonPaypalCheckout(
        session.token,
        order.id,
        selected.map((item) => ({ productId: item.productId, quantity: quantities[item.productId] })),
      );
      window.location.assign(checkout.approvalUrl);
    } catch {
      setError("暫時無法建立 PayPal 付款，請稍後再試。");
      setBusy(false);
    }
  }

  return <SidePanel open={open} title={`加單 · ${order.orderNumber}`} description="加單只接受 PayPal 付款。付款完成後商品才會加入原訂單。" onClose={onClose} closeLabel="關閉加單" className="self-service-addon-panel"
    footer={<><div className="self-service-addon-total"><span>加單總額</span><strong>{money(total, order.currency)}</strong></div><Button type="button" disabled={!selected.length || busy} onClick={() => void pay()}>{busy ? <LoaderCircle className="self-service-spin" /> : <CreditCard />}{busy ? "正在前往 PayPal…" : "使用 PayPal 付款"}</Button></>}>
    <div className="self-service-addon-products">
      {options.items.map((item) => {
        const quantity = quantities[item.productId] ?? 0;
        return <article key={item.id} className={quantity ? "is-selected" : ""}>
          <button type="button" className="self-service-addon-select" aria-pressed={quantity > 0} onClick={() => setQuantity(item.productId, quantity ? 0 : item.minQuantity, item.minQuantity, item.maxQuantity)}>
            <span className="self-service-addon-check">{quantity ? <Check /> : null}</span>
            <span><strong>{item.name}</strong><small>{item.sku || "—"}</small></span>
            <strong>{money(item.price, order.currency)}</strong>
          </button>
          {quantity ? <div className="self-service-addon-quantity"><span>數量</span><button type="button" aria-label={`減少 ${item.name}`} onClick={() => setQuantity(item.productId, quantity - 1, item.minQuantity, item.maxQuantity)}><Minus /></button><input type="number" min={item.minQuantity} max={item.maxQuantity} value={quantity} aria-label={`${item.name} 數量`} onChange={(event) => setQuantity(item.productId, Number(event.target.value), item.minQuantity, item.maxQuantity)} /><button type="button" aria-label={`增加 ${item.name}`} onClick={() => setQuantity(item.productId, quantity + 1, item.minQuantity, item.maxQuantity)}><Plus /></button><strong>{money(item.price * quantity, order.currency)}</strong></div> : null}
        </article>;
      })}
    </div>
    {error ? <p className="self-service-error" role="alert">{error}</p> : null}
  </SidePanel>;
}

function DetailView({ session, order, onBack, onLogout, printReceipt, loadAddonOptions, paymentNotice }: { session: CustomerSelfServiceSession; order: CustomerSelfServiceOrderDetail; onBack: () => void; onLogout: () => void; printReceipt: PrintReceiptFn; loadAddonOptions: AddonOptionsFn; paymentNotice?: string }) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [addonOpen, setAddonOpen] = useState(false);
  const [addonOptions, setAddonOptions] = useState<CustomerSelfServiceAddonOptions | null>(null);
  const itemTotal = useMemo(() => order.lines.reduce((total, line) => total + customerOrderLineTotal(line), 0), [order.lines]);
  const shippingFee = customerOrderShippingFee(order, itemTotal);
  useEffect(() => {
    let active = true;
    void loadAddonOptions(session.token, order.id).then((value) => { if (active) setAddonOptions(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [loadAddonOptions, order.id, session.token]);
  return (
    <main className="self-service-shell self-service-detail-shell">
      <PortalHeader session={session} onLogout={onLogout} detail={order} />
      <button type="button" className="self-service-back" onClick={onBack}><ArrowLeft />返回訂單列表</button>
      <section className="self-service-detail-title">
        <div><span>訂單</span><h1>{order.orderNumber}</h1></div>
        <StatusBadges order={order} />
        <div className="self-service-detail-actions">
          {addonOptions?.canAddOn ? <Button onClick={() => setAddonOpen(true)}><Plus />加單</Button> : null}
          {order.payments.length ? <Button onClick={() => setReceiptOpen(true)}><ReceiptText />預覽並下載收據</Button> : null}
        </div>
      </section>
      {paymentNotice ? <div className="self-service-addon-note is-success">{paymentNotice}</div> : null}
      {addonOptions && !addonOptions.canAddOn ? <div className="self-service-addon-note">{addonReason(addonOptions)}</div> : null}
      <section className="self-service-content-card">
        <header><div><span>訂單內容</span><h2>{order.lines.length} 項食品</h2></div><strong>{money(order.grandTotal, order.currency)}</strong></header>
        <div className="self-service-line-list">
          {order.lines.map((line, index) => <article key={line.id}>
            <span>{index + 1}</span>
            <div><strong>{line.name}</strong>{line.content && line.content !== line.name ? <small>{line.content}</small> : null}{line.isAddon ? <em>加單項目</em> : null}</div>
            <dl><div><dt>單價</dt><dd>{money(line.unitPrice, order.currency)}</dd></div><div><dt>數量</dt><dd>{line.quantity}</dd></div><div><dt>小計</dt><dd>{money(line.totalPrice, order.currency)}</dd></div></dl>
          </article>)}
        </div>
        <footer><span>食品小計</span><strong>{money(itemTotal, order.currency)}</strong><span>運費</span><strong>{money(shippingFee, order.currency)}</strong><span>訂單總額</span><strong>{money(order.grandTotal, order.currency)}</strong></footer>
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
      {receiptOpen ? <ReceiptPreview order={order} printReceipt={printReceipt} onClose={() => setReceiptOpen(false)} /> : null}
      {addonOpen && addonOptions ? <AddonPanel open session={session} order={order} options={addonOptions} onClose={() => setAddonOpen(false)} /> : null}
    </main>
  );
}

export function CustomerSelfServicePage({
  login = loginCustomerSelfService,
  restore = restoreCustomerSelfService,
  loadDetail = fetchCustomerSelfServiceOrder,
  loadAddonOptions = fetchCustomerSelfServiceAddonOptions,
  logout = logoutCustomerSelfService,
  printReceipt = printPdf,
}: { login?: LoginFn; restore?: RestoreFn; loadDetail?: DetailFn; loadAddonOptions?: AddonOptionsFn; logout?: LogoutFn; printReceipt?: PrintReceiptFn }) {
  const navigate = useNavigate();
  const { orderId = "" } = useParams<{ orderId?: string }>();
  const demoMode = import.meta.env.DEV
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demo") === "1";
  const [session, setSession] = useState<CustomerSelfServiceSession | null>(null);
  const [detail, setDetail] = useState<CustomerSelfServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const paypalHandled = useRef(false);

  useEffect(() => {
    if (demoMode) {
      setSession(DEMO_SESSION);
      setLoading(false);
      return;
    }
    restore().then(setSession).finally(() => setLoading(false));
  }, [demoMode, restore]);

  useEffect(() => {
    if (!session || !orderId) {
      setDetail(null);
      return;
    }
    let active = true;
    const summary = session.orders.find((item) => item.id === orderId);
    if (!summary) {
      setDetail(null);
      setDetailError("找不到此訂單，請返回訂單列表重新選擇。");
      return;
    }
    setLoading(true);
    setDetailError("");
    const request = demoMode
      ? Promise.resolve({ ...DEMO_DETAIL, id: summary.id, orderNumber: summary.orderNumber, deliveryDate: summary.deliveryDate })
      : loadDetail(session.token, summary.id);
    void request
      .then((value) => { if (active) setDetail(value); })
      .catch(() => { if (active) setDetailError("暫時無法載入訂單，請重新查詢。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [demoMode, loadDetail, orderId, session]);

  useEffect(() => {
    if (!session || demoMode || paypalHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("paypal");
    const checkoutId = params.get("addonCheckout");
    if (!action || !checkoutId) return;
    paypalHandled.current = true;
    setLoading(true); setDetailError("");
    const cleanup = () => window.history.replaceState({}, "", window.location.pathname);
    if (action === "cancel") {
      void cancelCustomerAddonPaypalCheckout(session.token, checkoutId)
        .catch(() => undefined)
        .finally(() => { setPaymentNotice("已取消 PayPal 付款，訂單沒有變更。"); cleanup(); setLoading(false); });
      return;
    }
    void captureCustomerAddonPaypalCheckout(session.token, checkoutId)
      .then((result) => {
        if (result.orderId) {
          navigate(`/self_service_search/${encodeURIComponent(result.orderId)}`, { replace: true });
        }
        setPaymentNotice("PayPal 付款成功，加單項目已加入訂單。");
      })
      .catch(() => setDetailError("PayPal 付款狀態暫時未能確認，請稍後重新查詢訂單；請勿重複付款。"))
      .finally(() => { cleanup(); setLoading(false); });
  }, [demoMode, navigate, session]);

  function selectOrder(order: CustomerSelfServiceOrderSummary) {
    if (!session) return;
    navigate(`/self_service_search/${encodeURIComponent(order.id)}`);
  }

  async function leave() {
    if (session) await logout(session.token).catch(() => undefined);
    setDetail(null); setSession(null);
    navigate("/self_service_search", { replace: true });
  }

  if (loading && !session) return <main className="self-service-loading"><LoaderCircle className="self-service-spin" /><span>正在載入客戶自助服務…</span></main>;
  if (!session) return <LoginView login={login} onLogin={setSession} />;
  if (detailError) return <main className="self-service-loading"><p role="alert">{detailError}</p><Button onClick={() => { setDetailError(""); navigate("/self_service_search"); }}>返回訂單列表</Button></main>;
  if (loading) return <main className="self-service-loading"><LoaderCircle className="self-service-spin" /><span>正在載入訂單…</span></main>;
  if (detail) return <DetailView session={session} order={detail} onBack={() => navigate("/self_service_search")} onLogout={() => void leave()} printReceipt={printReceipt} loadAddonOptions={demoMode ? loadDemoAddonOptions : loadAddonOptions} paymentNotice={paymentNotice} />;
  return <OrdersView session={session} onSelect={(order) => void selectOrder(order)} onLogout={() => void leave()} />;
}
