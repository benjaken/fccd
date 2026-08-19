import { supabase } from "@/lib/supabase";

const SESSION_KEY = "fccd.driver-delivery.session";

export type DriverDeliverySession = {
  token: string;
  teamId: string;
  teamName: string;
  expiresAt: string;
};

export type DriverAvailableOrder = {
  deliveryId: string;
  orderNumber: string;
  shipOutTime: string | null;
  deliveryTime: string | null;
  address: string;
  districtName: string | null;
  shippingMethod: string | null;
  warningText: string | null;
};
export type DriverAcceptedOrder = DriverAvailableOrder & {
  customerName: string | null; customerPhone: string | null;
  basicFee: number; totalFee: number; takenAt: string | null; fulfilledAt: string | null;
  driverId: string | null; driverName: string | null;
  surcharges: Array<{ id: string; name: string; amount: number }>;
  images: string[];
};

export type DriverFleetDriver = { id: string; name: string };
export type DriverFleetMonth = {
  month: string;
  orderCount: number;
  completedCount: number;
  totalFee: number;
};
export type DriverFleetDay = {
  date: string;
  orderCount: number;
  totalFee: number;
};
export type DriverFleetOrder = {
  deliveryId: string;
  orderNumber: string;
  shipOutTime: string | null;
  deliveryTime: string | null;
  address: string;
  customerName: string | null;
  customerPhone: string | null;
  basicFee: number;
  totalFee: number;
  status: string | null;
  takenAt: string | null;
  fulfilledAt: string | null;
  driverId: string | null;
  driverName: string | null;
  surcharges: Array<{ id: string; name: string; amount: number }>;
  images: string[];
};
export type DriverExportOrder = {
  orderNumber: string; deliveryDate: string; deliveryTime: string;
  customerName: string; customerPhone: string; district: string;
  address: string; shippingMethod: string; driverName: string;
};

type LoginRow = {
  session_token: string;
  team_id: string;
  team_name: string;
  expires_at: string;
};

type AvailableOrderRow = {
  delivery_id: string;
  order_number: string | null;
  ship_out_time: string | null;
  delivery_time: string | null;
  address: string | null;
  district_name: string | null;
  shipping_method: string | null;
  warning_text: string | null;
};

export async function loginDriverDelivery(loginCode: string) {
  const { data, error } = await supabase.rpc("driver_delivery_login", {
    p_login_code: loginCode.trim(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : null) as LoginRow | undefined;
  if (!row) throw new Error("登入密碼不正確");
  const session: DriverDeliverySession = {
    token: row.session_token,
    teamId: row.team_id,
    teamName: row.team_name,
    expiresAt: row.expires_at,
  };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function restoreDriverDeliverySession(): DriverDeliverySession | null {
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as DriverDeliverySession;
    if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function logoutDriverDelivery(token?: string) {
  window.sessionStorage.removeItem(SESSION_KEY);
  if (token) await supabase.rpc("driver_delivery_logout", { p_session_token: token });
}

export async function fetchDriverAvailableOrders(
  token: string,
  date: string,
  search = "",
) {
  const { data, error } = await supabase.rpc("driver_delivery_available_orders", {
    p_session_token: token,
    p_delivery_date: date,
    p_search: search.trim() || null,
  });
  if (error) throw error;
  return ((data ?? []) as AvailableOrderRow[]).map((row) => ({
    deliveryId: row.delivery_id,
    orderNumber: row.order_number?.trim() || "—",
    shipOutTime: row.ship_out_time,
    deliveryTime: row.delivery_time,
    address: row.address?.trim() || "未有送貨地址",
    districtName: row.district_name,
    shippingMethod: row.shipping_method,
    warningText: row.warning_text,
  } satisfies DriverAvailableOrder));
}

export async function fetchDriverAcceptedOrders(token: string, date: string, search = "") {
  const { data, error } = await supabase.rpc("driver_delivery_accepted_order_details", {
    p_session_token: token, p_delivery_date: date, p_search: search.trim() || null,
  });
  if (error) throw error;
  return ((data ?? []) as Array<AvailableOrderRow & Record<string, unknown>>).map((row) => ({
    deliveryId:row.delivery_id,orderNumber:row.order_number?.trim()||"—",shipOutTime:row.ship_out_time,deliveryTime:row.delivery_time,address:row.address?.trim()||"未有送貨地址",districtName:row.district_name,shippingMethod:row.shipping_method,warningText:row.warning_text,customerName:row.customer_name?String(row.customer_name):null,customerPhone:row.customer_phone?String(row.customer_phone):null,basicFee:Number(row.basic_fee)||0,totalFee:Number(row.total_fee)||0,takenAt:row.taken_at?String(row.taken_at):null,fulfilledAt:row.fulfilled_at?String(row.fulfilled_at):null,driverId:row.driver_id?String(row.driver_id):null,driverName:row.driver_name?String(row.driver_name):null,surcharges:Array.isArray(row.surcharges)?row.surcharges as DriverAcceptedOrder["surcharges"]:[],images:Array.isArray(row.images)?row.images.map(String):[],
  } satisfies DriverAcceptedOrder));
}

export async function acceptDriverAvailableOrder(token:string,deliveryId:string){const{error}=await supabase.rpc("driver_delivery_accept_order",{p_session_token:token,p_delivery_id:deliveryId});if(error)throw error;}
export async function pickupDriverOrder(token:string,deliveryId:string){const{error}=await supabase.rpc("driver_delivery_pickup_order",{p_session_token:token,p_delivery_id:deliveryId});if(error)throw error;}
export async function deliverDriverOrder(token:string,deliveryId:string){const{error}=await supabase.rpc("driver_delivery_deliver_order",{p_session_token:token,p_delivery_id:deliveryId});if(error)throw error;}
export async function assignAcceptedOrderDriver(token:string,deliveryId:string,driverId:string){const{error}=await supabase.rpc("driver_delivery_assign_driver",{p_session_token:token,p_delivery_id:deliveryId,p_driver_id:driverId});if(error)throw error;}

export async function rejectDriverAvailableOrder(token: string, deliveryId: string) {
  const { error } = await supabase.rpc("driver_delivery_reject_order", {
    p_session_token: token, p_delivery_id: deliveryId,
  });
  if (error) throw error;
}

export async function fetchDriverDistrictFees(token: string, search = "") {
  const { data, error } = await supabase.rpc("driver_delivery_district_fees", {
    p_session_token: token, p_search: search.trim() || null,
  });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string; fee: number }>;
}

export async function fetchDriverFleetDrivers(token: string) {
  const { data, error } = await supabase.rpc("driver_delivery_team_drivers", {
    p_session_token: token,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ driver_id: string; driver_name: string }>).map(
    (row) => ({ id: row.driver_id, name: row.driver_name }),
  ) satisfies DriverFleetDriver[];
}

export async function addDriverFleetDriver(token: string, name: string) {
  const { error } = await supabase.rpc("driver_delivery_add_driver", {
    p_session_token: token, p_display_name: name.trim(),
  });
  if (error) throw error;
}

export async function deleteDriverFleetDriver(token: string, driverId: string) {
  const { error } = await supabase.rpc("driver_delivery_delete_driver", {
    p_session_token: token, p_driver_id: driverId,
  });
  if (error) throw error;
}

export async function fetchDriverFleetSummary(token: string, driverId?: string, startDate?: string, endDate?: string) {
  const { data, error } = await supabase.rpc("driver_delivery_fleet_summary", {
    p_session_token: token,
    p_driver_id: driverId || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{
    month_start: string;
    order_count: number | string;
    completed_count: number | string;
    total_fee: number | string;
  }>).map((row) => ({
    month: row.month_start,
    orderCount: Number(row.order_count) || 0,
    completedCount: Number(row.completed_count) || 0,
    totalFee: Number(row.total_fee) || 0,
  })) satisfies DriverFleetMonth[];
}

export async function fetchDriverIncomeSummary(token: string, startDate?: string, endDate?: string) {
  const { data, error } = await supabase.rpc("driver_delivery_income_summary", { p_session_token: token, p_start_date: startDate || null, p_end_date: endDate || null });
  if (error) throw error;
  return ((data ?? []) as Array<{ month_start: string; order_count: number | string; completed_count: number | string; total_fee: number | string }>).map((row) => ({ month: row.month_start, orderCount: Number(row.order_count)||0, completedCount: Number(row.completed_count)||0, totalFee: Number(row.total_fee)||0 })) satisfies DriverFleetMonth[];
}

export async function fetchDriverFleetDays(
  token: string,
  month: string,
  driverId?: string,
  startDate?: string,
  endDate?: string,
) {
  const { data, error } = await supabase.rpc("driver_delivery_fleet_days", {
    p_session_token: token,
    p_month_start: month,
    p_driver_id: driverId || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{
    delivery_date: string;
    order_count: number | string;
    total_fee: number | string;
  }>).map((row) => ({
    date: row.delivery_date,
    orderCount: Number(row.order_count) || 0,
    totalFee: Number(row.total_fee) || 0,
  })) satisfies DriverFleetDay[];
}

export async function fetchDriverIncomeDays(token: string, month: string, startDate?: string, endDate?: string) {
  const { data, error } = await supabase.rpc("driver_delivery_income_days", { p_session_token: token, p_month_start: month, p_start_date: startDate || null, p_end_date: endDate || null });
  if (error) throw error;
  return ((data ?? []) as Array<{ delivery_date: string; order_count: number|string; total_fee: number|string }>).map((row) => ({ date: row.delivery_date, orderCount: Number(row.order_count)||0, totalFee: Number(row.total_fee)||0 })) satisfies DriverFleetDay[];
}

export async function fetchDriverFleetDayOrders(token: string, date: string, driverId?: string) {
  const { data, error } = await supabase.rpc("driver_delivery_day_orders", {
    p_session_token: token,
    p_delivery_date: date,
    p_driver_id: driverId || null,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    deliveryId: String(row.delivery_id),
    orderNumber: String(row.order_number || "—"),
    shipOutTime: row.ship_out_time ? String(row.ship_out_time) : null,
    deliveryTime: row.delivery_time ? String(row.delivery_time) : null,
    address: String(row.address || "未有送貨地址"),
    customerName: row.customer_name ? String(row.customer_name) : null,
    customerPhone: row.customer_phone ? String(row.customer_phone) : null,
    basicFee: Number(row.basic_fee) || 0,
    totalFee: Number(row.total_fee) || 0,
    status: row.delivery_status ? String(row.delivery_status) : null,
    takenAt: row.taken_at ? String(row.taken_at) : null,
    fulfilledAt: row.fulfilled_at ? String(row.fulfilled_at) : null,
    driverId: row.driver_id ? String(row.driver_id) : null,
    driverName: row.driver_name ? String(row.driver_name) : null,
    surcharges: Array.isArray(row.surcharges) ? row.surcharges as DriverFleetOrder["surcharges"] : [],
    images: Array.isArray(row.images) ? row.images.map(String) : [],
  })) satisfies DriverFleetOrder[];
}

export async function fetchDriverIncomeDayOrders(token: string, date: string) {
  const { data, error } = await supabase.rpc("driver_delivery_income_day_orders", { p_session_token: token, p_delivery_date: date });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    deliveryId:String(row.delivery_id),orderNumber:String(row.order_number||"—"),shipOutTime:row.ship_out_time?String(row.ship_out_time):null,deliveryTime:row.delivery_time?String(row.delivery_time):null,address:String(row.address||"未有送貨地址"),customerName:row.customer_name?String(row.customer_name):null,customerPhone:row.customer_phone?String(row.customer_phone):null,basicFee:Number(row.basic_fee)||0,totalFee:Number(row.total_fee)||0,status:row.delivery_status?String(row.delivery_status):null,takenAt:row.taken_at?String(row.taken_at):null,fulfilledAt:row.fulfilled_at?String(row.fulfilled_at):null,driverId:row.driver_id?String(row.driver_id):null,driverName:row.driver_name?String(row.driver_name):null,surcharges:Array.isArray(row.surcharges)?row.surcharges as DriverFleetOrder["surcharges"]:[],images:Array.isArray(row.images)?row.images.map(String):[],
  })) satisfies DriverFleetOrder[];
}

export async function fetchDriverExportOrders(token: string, month: string, includeUnassigned: boolean) {
  const { data, error } = await supabase.rpc("driver_delivery_export_orders", {
    p_session_token: token, p_month_start: month, p_include_unassigned: includeUnassigned,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    orderNumber:String(row.order_number||""),deliveryDate:String(row.delivery_date||""),deliveryTime:String(row.delivery_time||""),customerName:String(row.customer_name||""),customerPhone:String(row.customer_phone||""),district:String(row.district_name||""),address:String(row.address||""),shippingMethod:String(row.shipping_method||""),driverName:String(row.driver_name||""),
  })) satisfies DriverExportOrder[];
}

export async function fetchDriverSurchargeTypes(token: string) {
  const { data, error } = await supabase.rpc("driver_delivery_surcharge_types", { p_session_token: token });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function addDriverSurcharge(token: string, deliveryId: string, typeId: string, amount: number) {
  const { error } = await supabase.rpc("driver_delivery_add_surcharge", {
    p_session_token: token, p_delivery_id: deliveryId, p_surcharge_type_id: typeId, p_amount: amount,
  });
  if (error) throw error;
}

export async function deleteDriverSurcharge(token: string, surchargeId: string) {
  const { error } = await supabase.rpc("driver_delivery_delete_surcharge", {
    p_session_token: token, p_surcharge_id: surchargeId,
  });
  if (error) throw error;
}

export async function uploadDriverDeliveryImage(token: string, deliveryId: string, file: File) {
  const body = new FormData();
  body.append("token", token);
  body.append("deliveryId", deliveryId);
  body.append("file", file);
  const { data, error } = await supabase.functions.invoke("driver-delivery-files", { body });
  if (error) throw error;
  return String((data as { url?: string })?.url || "");
}

export async function deleteDriverDeliveryImage(token: string, deliveryId: string, url: string) {
  const { error } = await supabase.functions.invoke("driver-delivery-files", {
    body: { action: "delete", token, deliveryId, url },
  });
  if (error) throw error;
}
