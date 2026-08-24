import { supabase } from "@/lib/supabase";

export type DailySalesOption = {
  id: string;
  name: string;
  sortOrder: number;
  legacyId?: string;
};

export type DailySalesRestaurant = DailySalesOption & {
  legacyId: string;
};

export type RestaurantDailySalesMasters = {
  restaurants: DailySalesRestaurant[];
  paymentMethods: DailySalesOption[];
  deliveryPlatforms: DailySalesOption[];
  departments: DailySalesOption[];
  servicePeriods: DailySalesOption[];
  newProducts: DailySalesOption[];
};

export type RestaurantDailySalesRecord = {
  total: number;
  paymentAmounts: Record<string, number>;
  platformAmounts: Record<string, number>;
  departmentAmounts: Record<string, number>;
  periodAmounts: Record<string, number>;
  productQuantities: Record<string, number>;
  workingHours: Record<string, number>;
  realCashCountAmount: number;
  pettyCashAmount: number;
  remarks: string;
  receiptPath: string | null;
  receiptUrl: string | null;
};

export type RestaurantDailySalesSaveInput = RestaurantDailySalesRecord & {
  restaurantId: string;
  date: string;
  receiptFile?: File | null;
};

export type RestaurantDailySalesRecentItem = {
  date: string;
  total: number;
  hasMismatch?: boolean;
  editedAt?: string | null;
};

type DailySalesRow = {
  id: string;
  sales_at?: string | null;
  payment_method_id: string | null;
  payment_method_legacy_id: string | null;
  service_period_id: string | null;
  service_period_legacy_id: string | null;
  restaurant_department_id: string | null;
  restaurant_department_legacy_id: string | null;
  delivery_platform_id: string | null;
  delivery_platform_legacy_id: string | null;
  new_product_id: string | null;
  new_product_legacy_id: string | null;
  amount: number | string | null;
  quantity: number | string | null;
  sort_order: number | string | null;
  is_control_total: boolean | null;
  is_remark_section: boolean | null;
  petty_cash: boolean | null;
  manager_hours_department: string | null;
  working_hours: number | string | null;
  real_cash_count_amount: number | string | null;
  petty_cash_amount: number | string | null;
  remarks: string | null;
  image_url: string | null;
  pos_sheet_url: string | null;
};

export const RESTAURANT_SALES_RECEIPTS_BUCKET = "restaurant-sales-receipts";
export const MAX_RESTAURANT_SALES_RECEIPT_SIZE = 20 * 1024 * 1024;
export const RESTAURANT_WORKING_HOUR_OPTIONS: DailySalesOption[] = [
  { id: "樓面", name: "樓面", sortOrder: 0 },
  { id: "廚房", name: "廚房", sortOrder: 1 },
  { id: "水吧", name: "水吧", sortOrder: 2 },
];

export const emptyRestaurantDailySalesRecord = (): RestaurantDailySalesRecord => ({
  total: 0,
  paymentAmounts: {},
  platformAmounts: {},
  departmentAmounts: {},
  periodAmounts: {},
  productQuantities: {},
  workingHours: {},
  realCashCountAmount: 0,
  pettyCashAmount: 0,
  remarks: "",
  receiptPath: null,
  receiptUrl: null,
});

function optionSort(left: DailySalesOption, right: DailySalesOption) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

function normalizeRestaurantName(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function normalizeWorkingHoursDepartment(value: string) {
  const normalized = value.trim().replace(/\s+/g, "");
  if (/樓面|楼面/.test(normalized)) return "樓面";
  if (/廚房|厨房/.test(normalized)) return "廚房";
  if (/水吧/.test(normalized)) return "水吧";
  return value.trim();
}

export function pickRestaurantSalesReceiptSource(
  posSheetUrl: string | null | undefined,
  imageUrl: string | null | undefined,
) {
  const source = posSheetUrl?.trim() || imageUrl?.trim() || "";
  return source || null;
}

function resolveLegacyPlatformId(row: DailySalesRow, platforms: DailySalesOption[]) {
  if (row.delivery_platform_id) return row.delivery_platform_id;
  if (row.delivery_platform_legacy_id) {
    return platforms.find((platform) => platform.legacyId === row.delivery_platform_legacy_id)?.id ?? null;
  }
  const isUnlinkedLegacyPlatform =
    !row.payment_method_id && !row.payment_method_legacy_id &&
    !row.service_period_id && !row.service_period_legacy_id &&
    !row.restaurant_department_id && !row.restaurant_department_legacy_id &&
    !row.new_product_id && !row.new_product_legacy_id &&
    !row.manager_hours_department && !row.petty_cash &&
    !row.is_control_total && !row.is_remark_section && row.sort_order != null;
  if (!isUnlinkedLegacyPlatform) return null;
  const sortOrder = Number(row.sort_order);
  return platforms.find((platform) => platform.sortOrder === sortOrder)?.id ?? null;
}

async function fetchDeliveryPlatformOptions() {
  const { data, error } = await supabase
    .from("restaurant_delivery_platforms")
    .select("id,legacy_id,name,sort_order")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    legacyId: String(row.legacy_id ?? ""),
    name: String(row.name ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
  })).filter((row) => row.id && row.name).sort(optionSort);
}

export function pickDefaultRestaurant(restaurants: DailySalesRestaurant[]) {
  return (
    restaurants.find((restaurant) => {
      const name = normalizeRestaurantName(restaurant.name);
      return name.includes("將軍澳") || name.includes("将军澳") || name.includes("tko");
    }) ?? restaurants[0] ?? null
  );
}

export function hongKongDateValue(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function restaurantSalesDayBounds(date: string) {
  return {
    start: `${date}T00:00:00+08:00`,
    end: `${date}T23:59:59.999+08:00`,
    salesAt: `${date}T12:00:00+08:00`,
  };
}

export async function fetchRestaurantDailySalesMasters(): Promise<RestaurantDailySalesMasters> {
  const [restaurantsResult, paymentsResult, platformsResult, departmentsResult, periodsResult, productsResult] =
    await Promise.all([
      supabase.from("restaurants").select("id,legacy_id,name").eq("is_active", true).is("archived_at", null).order("name"),
      supabase.from("restaurant_payment_methods").select("id,name,sort_order").eq("is_active", true).is("archived_at", null).order("sort_order").order("name"),
      supabase.from("restaurant_delivery_platforms").select("id,legacy_id,name,sort_order").eq("is_active", true).is("archived_at", null).order("sort_order").order("name"),
      supabase.from("restaurant_departments").select("id,name,sort_order").eq("is_active", true).is("archived_at", null).order("sort_order").order("name"),
      supabase.from("restaurant_service_periods").select("id,name,sort_order").eq("is_active", true).is("archived_at", null).order("sort_order").order("name"),
      supabase.from("restaurant_new_products").select("id,name").eq("is_active", true).is("archived_at", null).order("name"),
    ]);

  const failed = [restaurantsResult, paymentsResult, platformsResult, departmentsResult, periodsResult, productsResult]
    .find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  const mapOptions = (rows: Array<Record<string, unknown>> | null, useIndex = false) =>
    (rows ?? []).map((row, index) => ({
      id: String(row.id),
      legacyId: String(row.legacy_id ?? ""),
      name: String(row.name ?? ""),
      sortOrder: useIndex ? index : Number(row.sort_order ?? 0),
    })).filter((row) => row.id && row.name).sort(optionSort);

  return {
    restaurants: (restaurantsResult.data ?? []).map((row, index) => ({
      id: String(row.id),
      legacyId: String(row.legacy_id ?? ""),
      name: String(row.name ?? ""),
      sortOrder: index,
    })),
    paymentMethods: mapOptions(paymentsResult.data),
    deliveryPlatforms: mapOptions(platformsResult.data),
    departments: mapOptions(departmentsResult.data),
    servicePeriods: mapOptions(periodsResult.data),
    newProducts: mapOptions(productsResult.data, true),
  };
}

export async function fetchRestaurantDailySales(
  restaurantId: string,
  date: string,
): Promise<RestaurantDailySalesRecord> {
  const { start, end } = restaurantSalesDayBounds(date);
  const [salesResult, platforms] = await Promise.all([
    supabase
      .from("restaurant_daily_sales")
      .select("id,payment_method_id,payment_method_legacy_id,service_period_id,service_period_legacy_id,restaurant_department_id,restaurant_department_legacy_id,delivery_platform_id,delivery_platform_legacy_id,new_product_id,new_product_legacy_id,amount,quantity,sort_order,is_control_total,is_remark_section,petty_cash,manager_hours_department,working_hours,real_cash_count_amount,petty_cash_amount,remarks,image_url,pos_sheet_url")
      .eq("restaurant_id", restaurantId)
      .gte("sales_at", start)
      .lte("sales_at", end),
    fetchDeliveryPlatformOptions(),
  ]);
  if (salesResult.error) throw new Error(salesResult.error.message);

  const record = emptyRestaurantDailySalesRecord();
  for (const row of (salesResult.data ?? []) as DailySalesRow[]) {
    const amount = Number(row.amount ?? 0);
    const receiptSource = pickRestaurantSalesReceiptSource(row.pos_sheet_url, row.image_url);
    if (receiptSource && !record.receiptPath) record.receiptPath = receiptSource;
    if (row.real_cash_count_amount != null) record.realCashCountAmount = Number(row.real_cash_count_amount);
    if (row.petty_cash_amount != null) record.pettyCashAmount = Number(row.petty_cash_amount);
    if (row.manager_hours_department) {
      const department = normalizeWorkingHoursDepartment(row.manager_hours_department);
      record.workingHours[department] = (record.workingHours[department] ?? 0) + Number(row.working_hours ?? 0);
    }
    if (row.is_control_total) {
      record.total = amount;
      record.remarks = row.remarks ?? "";
      if (receiptSource) record.receiptPath = receiptSource;
    } else if (row.payment_method_id) {
      record.paymentAmounts[row.payment_method_id] = amount;
    } else if (resolveLegacyPlatformId(row, platforms)) {
      const platformId = resolveLegacyPlatformId(row, platforms)!;
      record.platformAmounts[platformId] = (record.platformAmounts[platformId] ?? 0) + amount;
    } else if (row.restaurant_department_id) {
      record.departmentAmounts[row.restaurant_department_id] = amount;
    } else if (row.service_period_id) {
      record.periodAmounts[row.service_period_id] = amount;
    } else if (row.new_product_id) {
      record.productQuantities[row.new_product_id] = Number(row.quantity ?? 0);
    }
  }
  if (record.receiptPath) {
    if (/^\/\//.test(record.receiptPath)) {
      record.receiptUrl = `https:${record.receiptPath}`;
    } else if (/^https?:\/\//i.test(record.receiptPath)) {
      record.receiptUrl = record.receiptPath;
    } else {
      const { data: signed } = await supabase.storage
        .from(RESTAURANT_SALES_RECEIPTS_BUCKET)
        .createSignedUrl(record.receiptPath, 60 * 60);
      record.receiptUrl = signed?.signedUrl ?? null;
    }
  }
  return record;
}

export async function restaurantDailySalesRecordExists(restaurantId: string, date: string) {
  const { start, end } = restaurantSalesDayBounds(date);
  const { count, error } = await supabase
    .from("restaurant_daily_sales")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .gte("sales_at", start)
    .lte("sales_at", end);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function fetchRecentRestaurantDailySales(
  restaurantId: string,
  fromDate?: string,
  toDate?: string,
): Promise<RestaurantDailySalesRecentItem[]> {
  let query = supabase
    .from("restaurant_daily_sales")
    .select("sales_at,amount,bubble_modified_at,created_at")
    .eq("restaurant_id", restaurantId)
    .eq("is_control_total", true)
    .not("sales_at", "is", null)
    .order("sales_at", { ascending: false });
  if (fromDate) query = query.gte("sales_at", restaurantSalesDayBounds(fromDate).start);
  if (toDate) query = query.lte("sales_at", restaurantSalesDayBounds(toDate).end);
  const { data, error } = await query.limit(fromDate || toDate ? 1000 : 30);
  if (error) throw new Error(error.message);
  const recentItems = (data ?? []).map((row) => ({
    date: hongKongDateValue(new Date(String(row.sales_at))),
    total: Number(row.amount ?? 0),
    editedAt: row.bubble_modified_at ?? row.created_at ?? null,
  }));
  if (!recentItems.length) return [];

  const firstDate = recentItems.reduce((earliest, item) => item.date < earliest ? item.date : earliest, recentItems[0].date);
  const lastDate = recentItems.reduce((latest, item) => item.date > latest ? item.date : latest, recentItems[0].date);
  const detailRows: DailySalesRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const detailResult = await supabase
      .from("restaurant_daily_sales")
      .select("id,sales_at,payment_method_id,payment_method_legacy_id,service_period_id,service_period_legacy_id,restaurant_department_id,restaurant_department_legacy_id,delivery_platform_id,delivery_platform_legacy_id,new_product_id,new_product_legacy_id,amount,quantity,sort_order,is_control_total,is_remark_section,petty_cash,manager_hours_department")
      .eq("restaurant_id", restaurantId)
      .gte("sales_at", restaurantSalesDayBounds(firstDate).start)
      .lte("sales_at", restaurantSalesDayBounds(lastDate).end)
      .order("sales_at")
      .range(offset, offset + pageSize - 1);
    if (detailResult.error) throw new Error(detailResult.error.message);
    const page = (detailResult.data ?? []) as DailySalesRow[];
    detailRows.push(...page);
    if (page.length < pageSize) break;
  }

  const platforms = await fetchDeliveryPlatformOptions();
  const totalsByDate = new Map<string, { payments: number; departments: number; periods: number }>();
  for (const row of detailRows) {
    if (!row.sales_at || row.is_control_total) continue;
    const rowDate = hongKongDateValue(new Date(row.sales_at));
    const totals = totalsByDate.get(rowDate) ?? { payments: 0, departments: 0, periods: 0 };
    const amount = Number(row.amount ?? 0);
    if (row.payment_method_id || resolveLegacyPlatformId(row, platforms)) totals.payments += amount;
    else if (row.restaurant_department_id) totals.departments += amount;
    else if (row.service_period_id) totals.periods += amount;
    totalsByDate.set(rowDate, totals);
  }

  return recentItems.map((item) => {
    const totals = totalsByDate.get(item.date) ?? { payments: 0, departments: 0, periods: 0 };
    return {
      ...item,
      hasMismatch: [totals.payments, totals.departments, totals.periods]
        .some((sectionTotal) => Math.abs(sectionTotal - item.total) >= 0.01),
    };
  });
}

function existingKey(row: DailySalesRow, platforms: DailySalesOption[] = []) {
  if (row.is_control_total) return "control";
  if (row.payment_method_id) return `payment:${row.payment_method_id}`;
  const platformId = resolveLegacyPlatformId(row, platforms);
  if (platformId) return `platform:${platformId}`;
  if (row.restaurant_department_id) return `department:${row.restaurant_department_id}`;
  if (row.service_period_id) return `period:${row.service_period_id}`;
  if (row.new_product_id) return `product:${row.new_product_id}`;
  if (row.manager_hours_department) return `hours:${row.manager_hours_department}`;
  return "";
}

export async function saveRestaurantDailySales(input: RestaurantDailySalesSaveInput) {
  const { start, end, salesAt } = restaurantSalesDayBounds(input.date);
  let receiptPath = input.receiptPath;
  if (input.receiptFile) {
    if (!input.receiptFile.size) throw new Error("restaurant_sales_receipt_empty");
    if (input.receiptFile.size > MAX_RESTAURANT_SALES_RECEIPT_SIZE) {
      throw new Error("restaurant_sales_receipt_too_large");
    }
    const extension = input.receiptFile.name.split(".").pop()?.toLowerCase() || "jpg";
    receiptPath = `${input.restaurantId}/${input.date}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(RESTAURANT_SALES_RECEIPTS_BUCKET)
      .upload(receiptPath, input.receiptFile, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);
  }
  const [salesResult, platforms] = await Promise.all([
    supabase
      .from("restaurant_daily_sales")
      .select("id,payment_method_id,payment_method_legacy_id,service_period_id,service_period_legacy_id,restaurant_department_id,restaurant_department_legacy_id,delivery_platform_id,delivery_platform_legacy_id,new_product_id,new_product_legacy_id,amount,quantity,sort_order,is_control_total,is_remark_section,petty_cash,manager_hours_department,working_hours,real_cash_count_amount,petty_cash_amount,remarks,image_url,pos_sheet_url")
      .eq("restaurant_id", input.restaurantId)
      .gte("sales_at", start)
      .lte("sales_at", end),
    fetchDeliveryPlatformOptions(),
  ]);
  if (salesResult.error) throw new Error(salesResult.error.message);

  const existing = new Map<string, DailySalesRow>();
  for (const row of (salesResult.data ?? []) as DailySalesRow[]) {
    const key = existingKey(row, platforms);
    if (key && !existing.has(key)) existing.set(key, row);
  }

  const rows: Array<{ key: string; fields: Record<string, unknown> }> = [
    { key: "control", fields: { is_control_total: true, amount: input.total, real_cash_count_amount: input.realCashCountAmount, petty_cash_amount: input.pettyCashAmount, remarks: input.remarks.trim() || null, has_image: Boolean(receiptPath), image_url: receiptPath, pos_sheet_url: receiptPath } },
    ...Object.entries(input.paymentAmounts).map(([id, amount]) => ({ key: `payment:${id}`, fields: { payment_method_id: id, amount } })),
    ...Object.entries(input.platformAmounts).map(([id, amount]) => ({ key: `platform:${id}`, fields: { delivery_platform_id: id, amount } })),
    ...Object.entries(input.departmentAmounts).map(([id, amount]) => ({ key: `department:${id}`, fields: { restaurant_department_id: id, amount } })),
    ...Object.entries(input.periodAmounts).map(([id, amount]) => ({ key: `period:${id}`, fields: { service_period_id: id, amount } })),
    ...Object.entries(input.productQuantities).map(([id, quantity]) => ({ key: `product:${id}`, fields: { new_product_id: id, quantity } })),
    ...Object.entries(input.workingHours).map(([department, workingHours]) => ({ key: `hours:${department}`, fields: { manager_hours_department: department, working_hours: workingHours } })),
  ];

  const updates = rows.filter((row) => existing.has(row.key));
  const inserts = rows.filter((row) => !existing.has(row.key)).map((row) => ({
    legacy_id: `web-daily-sales-${input.restaurantId}-${input.date}-${row.key}`,
    restaurant_id: input.restaurantId,
    sales_at: salesAt,
    bubble_created_at: new Date().toISOString(),
    bubble_modified_at: new Date().toISOString(),
    is_control_total: false,
    is_remark_section: false,
    has_image: false,
    petty_cash: false,
    ...row.fields,
  }));

  const updateResults = await Promise.all(updates.map((row) =>
    supabase.from("restaurant_daily_sales").update({
      ...row.fields,
      sales_at: salesAt,
      bubble_modified_at: new Date().toISOString(),
    }).eq("id", existing.get(row.key)!.id),
  ));
  const updateError = updateResults.find((result) => result.error)?.error;
  if (updateError) throw new Error(updateError.message);
  if (inserts.length) {
    const { error: insertError } = await supabase.from("restaurant_daily_sales").insert(inserts);
    if (insertError) throw new Error(insertError.message);
  }
}
