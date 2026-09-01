import { supabase } from "@/lib/supabase";

type FamousBrandQuoteRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  grand_total: number | string | null;
  currency: string | null;
  quote_status: string | null;
  updated_at: string;
};

export type FamousBrandCustomer = {
  key: string;
  brandName: string;
  quoteCount: number;
  openQuoteCount: number;
  doneDealCount: number;
  totalAmount: number;
  currency: string;
  latestQuoteId: string;
  latestQuoteNumber: string;
  latestDealAt: string;
  orders: FamousBrandCustomerOrder[];
};

export type FamousBrandCustomerOrder = {
  id: string;
  orderNumber: string;
  status: string;
  amount: number;
  currency: string;
  updatedAt: string;
};

function customerOrder(row: FamousBrandQuoteRow): FamousBrandCustomerOrder {
  const amount = Number(row.grand_total ?? 0);
  return {
    id: row.id,
    orderNumber: row.order_number || "",
    status: row.quote_status || "",
    amount: Number.isFinite(amount) ? amount : 0,
    currency: row.currency || "HKD",
    updatedAt: row.updated_at,
  };
}

function brandName(row: FamousBrandQuoteRow) {
  const source = row.company_name_snapshot?.trim()
    || row.customer_name_snapshot?.trim()
    || "未設定品牌";
  const normalized = source.toLocaleLowerCase("zh-HK");
  if (normalized.includes("hang seng")) return "Hang Seng Bank";
  if (normalized.includes("morgan stanley") || normalized.includes("morgan stanely")) return "Morgan Stanley";
  if (normalized.includes("hong kong design centre")) return "Hong Kong Design Centre";
  if (normalized.includes("rocco design architects")) return "Rocco Design Architects";
  if (normalized.includes("明愛醫院") || normalized.includes("caritas medical centre")) return "明愛醫院";
  if (normalized.includes("新生精神康復會") || normalized.includes("new life psychiatric rehabilitation association")) return "新生精神康復會";
  return source.split(/\s+\/\s+/)[0]?.trim() || source;
}

export function aggregateFamousBrandCustomers(rows: FamousBrandQuoteRow[]) {
  const customers = new Map<string, FamousBrandCustomer>();

  for (const row of rows) {
    const name = brandName(row);
    const key = name.toLocaleLowerCase("zh-HK");
    const amount = Number(row.grand_total ?? 0);
    const current = customers.get(key);
    if (!current) {
      customers.set(key, {
        key,
        brandName: name,
        quoteCount: 1,
        openQuoteCount: row.quote_status === "Done Deal" ? 0 : 1,
        doneDealCount: row.quote_status === "Done Deal" ? 1 : 0,
        totalAmount: Number.isFinite(amount) ? amount : 0,
        currency: row.currency || "HKD",
        latestQuoteId: row.id,
        latestQuoteNumber: row.order_number || "",
        latestDealAt: row.updated_at,
        orders: [customerOrder(row)],
      });
      continue;
    }

    current.orders.push(customerOrder(row));
    current.quoteCount += 1;
    if (row.quote_status === "Done Deal") current.doneDealCount += 1;
    else current.openQuoteCount += 1;
    if (current.currency === (row.currency || "HKD") && Number.isFinite(amount)) {
      current.totalAmount += amount;
    }
    if (row.updated_at > current.latestDealAt) {
      current.latestDealAt = row.updated_at;
      current.latestQuoteId = row.id;
      current.latestQuoteNumber = row.order_number || "";
    }
  }

  for (const customer of customers.values()) {
    customer.orders.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  return [...customers.values()].sort((a, b) =>
    b.quoteCount - a.quoteCount
      || b.latestDealAt.localeCompare(a.latestDealAt)
      || a.brandName.localeCompare(b.brandName, "zh-HK"),
  );
}

export async function fetchFamousBrandCustomers() {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,customer_name_snapshot,company_name_snapshot,grand_total,currency,quote_status,updated_at")
    .eq("document_type", "quote")
    .eq("is_hong_kong_famous_brand", true)
    .or('quote_status.is.null,quote_status.neq."Case Closed"')
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return aggregateFamousBrandCustomers((data ?? []) as FamousBrandQuoteRow[]);
}
