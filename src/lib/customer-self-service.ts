import { supabase } from "@/lib/supabase";

const SESSION_KEY = "fccd.customer-self-service.session";

export type CustomerSelfServiceOrderSummary = {
  id: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  grandTotal: number;
  currency: string;
};

export type CustomerSelfServiceSession = {
  token: string;
  expiresAt: string;
  maskedPhone: string;
  maskedEmail: string;
  orders: CustomerSelfServiceOrderSummary[];
};

export type CustomerSelfServiceLine = {
  id: string;
  name: string;
  content: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isAddon: boolean;
};

export type CustomerSelfServicePayment = {
  id: string;
  amount: number;
  paymentAt: string | null;
  method: string | null;
  receiptReference: string | null;
};

export type CustomerSelfServiceOrderDetail = {
  id: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  deliveryTime: string | null;
  customerName: string | null;
  companyName: string | null;
  phoneA: string | null;
  phoneB: string | null;
  email: string | null;
  maskedPhoneA: string;
  maskedPhoneB: string | null;
  maskedEmail: string;
  address: string | null;
  shippingMethod: string | null;
  deliveryStatus: string | null;
  factoryArranged: boolean;
  fleetArranged: boolean;
  currency: string;
  grandTotal: number;
  outstanding: number;
  paid: boolean;
  channelName: string | null;
  channelEmail: string | null;
  lines: CustomerSelfServiceLine[];
  payments: CustomerSelfServicePayment[];
};

type LoginRow = {
  session_token: string;
  session_expires_at: string;
  masked_phone: string;
  masked_email: string;
  order_id: string;
  order_number: string | null;
  order_date: string;
  delivery_date: string | null;
  grand_total: number | string | null;
  currency: string | null;
};

type RestoredRow = Omit<LoginRow, "session_token">;

function summary(row: LoginRow | RestoredRow): CustomerSelfServiceOrderSummary {
  return {
    id: row.order_id,
    orderNumber: row.order_number || "—",
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    grandTotal: Number(row.grand_total) || 0,
    currency: row.currency || "HKD",
  };
}

function saveSession(session: CustomerSelfServiceSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: session.token }));
}

export async function loginCustomerSelfService(
  phone: string,
  email: string,
): Promise<CustomerSelfServiceSession> {
  const { data, error } = await supabase.rpc("customer_self_service_login", {
    p_phone: phone,
    p_email: email,
  });
  if (error) throw error;
  const rows = (data || []) as LoginRow[];
  if (!rows.length) throw new Error("orders_not_found");
  const first = rows[0];
  const session = {
    token: first.session_token,
    expiresAt: first.session_expires_at,
    maskedPhone: first.masked_phone,
    maskedEmail: first.masked_email,
    orders: rows.map(summary),
  };
  saveSession(session);
  return session;
}

export async function restoreCustomerSelfService(): Promise<CustomerSelfServiceSession | null> {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let token = "";
  try { token = String((JSON.parse(raw) as { token?: unknown }).token || ""); } catch { return null; }
  if (!token) return null;
  const { data, error } = await supabase.rpc("customer_self_service_orders", {
    p_session_token: token,
  });
  if (error || !data?.length) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  const rows = data as RestoredRow[];
  const first = rows[0];
  return {
    token,
    expiresAt: first.session_expires_at,
    maskedPhone: first.masked_phone,
    maskedEmail: first.masked_email,
    orders: rows.map(summary),
  };
}

export async function fetchCustomerSelfServiceOrder(
  token: string,
  orderId: string,
): Promise<CustomerSelfServiceOrderDetail> {
  const { data, error } = await supabase.rpc("customer_self_service_order_detail", {
    p_session_token: token,
    p_order_id: orderId,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("order_not_found");
  return data as CustomerSelfServiceOrderDetail;
}

export async function logoutCustomerSelfService(token: string) {
  sessionStorage.removeItem(SESSION_KEY);
  await supabase.rpc("customer_self_service_logout", { p_session_token: token });
}
