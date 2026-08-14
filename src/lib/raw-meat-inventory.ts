import { supabase } from "@/lib/supabase";

export const RAW_MEAT_MOVEMENTS_PAGE_SIZE = 15;
export const RAW_MEAT_FIRST_DATA_YEAR = 2023;

export type RawMeatItemOption = {
  id: string;
  name: string;
  englishName: string | null;
  sortOrder: number | null;
  canShipDirectly: boolean;
  isActive: boolean;
};

export type RawMeatMovementRow = {
  id: string;
  movementAt: string | null;
  productName: string;
  inboundUnitPrice: number | null;
  inboundQuantityKg: number | null;
  outboundQuantityKg: number | null;
  balanceKg: number;
  totalAmount: number | null;
  supplierName: string | null;
  remarks: string | null;
};

type ItemRow = {
  id: string;
  name: string;
  english_name: string | null;
  sort_order: number | string | null;
  can_ship_directly: boolean | null;
  is_active: boolean | null;
};

type MovementRow = {
  id: string;
  movement_at: string | null;
  inbound_quantity_kg: number | string | null;
  outbound_quantity_kg: number | string | null;
  inbound_unit_price: number | string | null;
  inbound_total_amount: number | string | null;
  remarks: string | null;
  bubble_created_at: string | null;
  created_at: string;
  suppliers:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function relatedSupplierName(value: MovementRow["suppliers"]): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.company_name?.trim();
  return name || null;
}

function movementSortKey(row: MovementRow) {
  return row.movement_at || row.bubble_created_at || row.created_at || "";
}

/** Current calendar year in Asia/Hong_Kong. */
export function currentHongKongYear(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
    }).format(now),
  );
}

export function rawMeatYearOptions(now = new Date()) {
  const currentYear = currentHongKongYear(now);
  return Array.from(
    { length: currentYear - RAW_MEAT_FIRST_DATA_YEAR + 1 },
    (_, index) => currentYear - index,
  );
}

export function hongKongYearBounds(year: number) {
  return {
    start: `${year}-01-01T00:00:00+08:00`,
    end: `${year + 1}-01-01T00:00:00+08:00`,
  };
}

export async function fetchRawMeatItems(): Promise<RawMeatItemOption[]> {
  const { data, error } = await supabase
    .from("raw_meat_items")
    .select("id,name,english_name,sort_order,can_ship_directly,is_active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as ItemRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    englishName: row.english_name,
    sortOrder: toNumber(row.sort_order),
    canShipDirectly: Boolean(row.can_ship_directly),
    isActive: row.is_active !== false,
  }));
}

export async function fetchRawMeatMovementsForItem(
  itemId: string,
  productName: string,
  year: number = currentHongKongYear(),
): Promise<RawMeatMovementRow[]> {
  const { start, end } = hongKongYearBounds(year);

  const [openingResult, yearResult] = await Promise.all([
    supabase
      .from("raw_meat_stock_movements")
      .select("inbound_quantity_kg,outbound_quantity_kg,movement_at")
      .eq("raw_meat_item_id", itemId)
      .lt("movement_at", start),
    supabase
      .from("raw_meat_stock_movements")
      .select(
        "id,movement_at,inbound_quantity_kg,outbound_quantity_kg,inbound_unit_price,inbound_total_amount,remarks,bubble_created_at,created_at,suppliers(company_name)",
      )
      .eq("raw_meat_item_id", itemId)
      .gte("movement_at", start)
      .lt("movement_at", end)
      .order("movement_at", { ascending: true, nullsFirst: false })
      .order("bubble_created_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  if (openingResult.error) throw openingResult.error;
  if (yearResult.error) throw yearResult.error;

  let balance = 0;
  for (const row of openingResult.data ?? []) {
    balance +=
      (toNumber(row.inbound_quantity_kg) ?? 0) -
      (toNumber(row.outbound_quantity_kg) ?? 0);
  }

  const chronological = [...((yearResult.data ?? []) as MovementRow[])].sort(
    (a, b) => {
      const left = movementSortKey(a);
      const right = movementSortKey(b);
      if (left === right) return a.id.localeCompare(b.id);
      return left < right ? -1 : 1;
    },
  );

  const withBalance: RawMeatMovementRow[] = chronological.map((row) => {
    const inbound = toNumber(row.inbound_quantity_kg) ?? 0;
    const outbound = toNumber(row.outbound_quantity_kg) ?? 0;
    balance += inbound - outbound;
    return {
      id: row.id,
      movementAt: row.movement_at || row.bubble_created_at || row.created_at,
      productName,
      inboundUnitPrice: toNumber(row.inbound_unit_price),
      inboundQuantityKg: toNumber(row.inbound_quantity_kg),
      outboundQuantityKg: toNumber(row.outbound_quantity_kg),
      balanceKg: balance,
      totalAmount: toNumber(row.inbound_total_amount),
      supplierName: relatedSupplierName(row.suppliers),
      remarks: row.remarks,
    };
  });

  // Newest first for the list, matching Bubble operational browsing.
  return withBalance.reverse();
}

export async function updateRawMeatMovementRemark(
  movementId: string,
  remarks: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc(
    "update_raw_meat_movement_remark",
    {
      p_movement_id: movementId,
      p_remarks: remarks,
    },
  );
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function updateRawMeatItemFlags(
  itemId: string,
  flags: { canShipDirectly: boolean; isActive: boolean },
): Promise<void> {
  const { error } = await supabase.rpc("update_raw_meat_item_flags", {
    p_item_id: itemId,
    p_can_ship_directly: flags.canShipDirectly,
    p_is_active: flags.isActive,
  });
  if (error) throw error;
}
