import {
  addCalendarDays,
  clockFromValue,
  fetchDeliveryExportRows,
  type DeliveryListItem,
} from "@/lib/deliveries"
import { supabase } from "@/lib/supabase"

export const UNASSIGNED_FLEET_ID = "__unassigned__"
export const ALL_BRAND_ID = "__all__"

export type FactoryBoardData = {
  dates: string[]
  items: DeliveryListItem[]
  portionsByOrderId: Record<string, number>
}

export type FactoryOrderLine = {
  id: string
  label: string
  printed: boolean
}

export type FactoryOrderJob = {
  packingNote: string | null
  dispatchTime: string | null
  arrivalWindow: string | null
  lines: FactoryOrderLine[]
}

export type FactoryFleet = {
  id: string
  name: string
  shortName: string | null
}

export type FactoryBrand = {
  id: string
  name: string
}

export type FactoryMenuRow = {
  label: string
  quantity: number
}

const PORTION_CHUNK_SIZE = 100

export function factoryVisibleDates(startDate: string, days = 3): string[] {
  return Array.from({ length: days }, (_, index) =>
    addCalendarDays(startDate, index),
  )
}

/** Hong Kong calendar date for a UTC timestamp. */
export function hongKongDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso))
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  if (!year || !month || !day) {
    return iso.slice(0, 10)
  }
  return `${year}-${month}-${day}`
}

export function groupDeliveriesByDate(
  items: DeliveryListItem[],
  dates: string[],
): Record<string, DeliveryListItem[]> {
  const grouped: Record<string, DeliveryListItem[]> = Object.fromEntries(
    dates.map((date) => [date, [] as DeliveryListItem[]]),
  )
  for (const item of items) {
    if (!item.deliveryAt) continue
    const key = hongKongDateKey(item.deliveryAt)
    grouped[key]?.push(item)
  }
  for (const date of dates) {
    grouped[date]?.sort((left, right) => {
      const time = (left.deliveryTime ?? "").localeCompare(right.deliveryTime ?? "")
      if (time !== 0) return time
      return (left.orderNumber ?? "").localeCompare(right.orderNumber ?? "", "zh-Hant")
    })
  }
  return grouped
}

export function fleetBadgeChar(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? ""
  if (!trimmed) return ""
  return Array.from(trimmed)[0] ?? ""
}

export function mapFactoryFleet(row: {
  id: string
  name?: string | null
  short_name?: string | null
}): FactoryFleet {
  return {
    id: row.id,
    name: row.name?.trim() || row.short_name?.trim() || row.id,
    shortName: row.short_name?.trim() || null,
  }
}

export function fleetBadgeForDelivery(
  item: Pick<DeliveryListItem, "motorcadeId" | "motorcadeName">,
  fleets: FactoryFleet[],
): string {
  const fleet = fleets.find((entry) => entry.id === item.motorcadeId)
  return fleetBadgeChar(fleet?.shortName || fleet?.name || item.motorcadeName)
}

export function formatFactoryQuantity(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return rounded.replace(/\.0$/, "")
}

export function formatFactoryLineLabel(line: {
  productName?: string | null
  content?: string | null
  quantity?: number | null
}): string {
  const content = line.content?.trim() ?? ""
  const product = line.productName?.trim() ?? ""
  let base = content || product
  if (content && product && !content.includes(product)) {
    const prefix = /^\(.*\)$/.test(content)
      ? content
      : content.startsWith("(")
        ? content
        : `(${content})`
    base = `${prefix} ${product}`
  }
  const quantity = formatFactoryQuantity(line.quantity ?? null)
  if (!base) {
    return quantity ? `(x ${quantity})` : ""
  }
  if (!quantity || /\(x\s+/i.test(base)) {
    return base
  }
  return `${base} (x ${quantity})`
}

export function filterDispatchRows(
  rows: DeliveryListItem[],
  date: string,
  fleetId: string,
): DeliveryListItem[] {
  return rows
    .filter((row) => {
      if (!row.deliveryAt || hongKongDateKey(row.deliveryAt) !== date) {
        return false
      }
      if (fleetId === UNASSIGNED_FLEET_ID) {
        return !row.motorcadeId
      }
      return row.motorcadeId === fleetId
    })
    .sort((left, right) => {
      const time = (left.deliveryTime ?? "").localeCompare(right.deliveryTime ?? "")
      if (time !== 0) return time
      return (left.orderNumber ?? "").localeCompare(right.orderNumber ?? "", "zh-Hant")
    })
}

export async function fetchFactoryFleets(): Promise<FactoryFleet[]> {
  const { data, error } = await supabase
    .from("delivery_teams")
    .select("id, name, short_name, is_active, bubble_created_at")
    .eq("is_active", true)
    .order("bubble_created_at", { ascending: true, nullsFirst: false })
  if (error) {
    throw error
  }
  return (data ?? []).map((row) =>
    mapFactoryFleet({
      id: row.id as string,
      name: row.name as string | null,
      short_name: row.short_name as string | null,
    }),
  )
}

export async function fetchFactoryBrands(): Promise<FactoryBrand[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, is_active, archived_at, sort_order")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name")
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: ((row.name as string | null)?.trim() || (row.id as string)).trim(),
  }))
}

export async function fetchFactoryMenuRows(
  orderIds: string[],
  brandId: string,
): Promise<FactoryMenuRow[]> {
  const uniqueIds = [...new Set(orderIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return []
  }

  let allowedIds = uniqueIds
  if (brandId !== ALL_BRAND_ID) {
    const matched: string[] = []
    for (let index = 0; index < uniqueIds.length; index += PORTION_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(index, index + PORTION_CHUNK_SIZE)
      const { data, error } = await supabase
        .from("orders")
        .select("id, channel_id")
        .in("id", chunk)
      if (error) {
        throw error
      }
      for (const row of data ?? []) {
        if ((row.channel_id as string | null) === brandId) {
          matched.push(row.id as string)
        }
      }
    }
    allowedIds = matched
  }

  if (allowedIds.length === 0) {
    return []
  }

  const totals = new Map<string, number>()
  for (let index = 0; index < allowedIds.length; index += PORTION_CHUNK_SIZE) {
    const chunk = allowedIds.slice(index, index + PORTION_CHUNK_SIZE)
    const { data, error } = await supabase
      .from("order_lines")
      .select("product_name_snapshot, content_snapshot, quantity")
      .in("order_id", chunk)
      .eq("is_void", false)
    if (error) {
      throw error
    }
    for (const row of data ?? []) {
      const quantity = Number(row.quantity ?? 0)
      if (!Number.isFinite(quantity) || quantity === 0) continue
      const label = formatFactoryLineLabel({
        productName: row.product_name_snapshot as string | null,
        content: row.content_snapshot as string | null,
        quantity: null,
      })
      if (!label) continue
      totals.set(label, (totals.get(label) ?? 0) + quantity)
    }
  }

  return [...totals.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], "zh-Hant"))
    .map(([label, quantity]) => ({ label, quantity }))
}

async function fetchOrderPortionTotals(
  orderIds: string[],
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {}
  if (orderIds.length === 0) {
    return totals
  }

  for (let index = 0; index < orderIds.length; index += PORTION_CHUNK_SIZE) {
    const chunk = orderIds.slice(index, index + PORTION_CHUNK_SIZE)
    const { data, error } = await supabase
      .from("order_lines")
      .select("order_id, quantity")
      .in("order_id", chunk)
      .eq("is_void", false)
    if (error) {
      throw error
    }
    for (const row of data ?? []) {
      const orderId = row.order_id as string
      const quantity = Number(row.quantity ?? 0)
      totals[orderId] =
        (totals[orderId] ?? 0) + (Number.isFinite(quantity) ? quantity : 0)
    }
  }

  return totals
}

export async function fetchFactoryBoard(
  startDate: string,
  days = 3,
): Promise<FactoryBoardData> {
  const dates = factoryVisibleDates(startDate, days)
  const items = await fetchDeliveryExportRows({
    search: "",
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    motorcadeId: "",
    shippingMethodId: "",
  })
  const orderIds = [
    ...new Set(
      items
        .map((item) => item.orderId)
        .filter((orderId): orderId is string => Boolean(orderId)),
    ),
  ]
  return {
    dates,
    items,
    portionsByOrderId: await fetchOrderPortionTotals(orderIds),
  }
}

export async function fetchFactoryOrderJob(orderId: string): Promise<FactoryOrderJob> {
  const [orderResult, linesResult] = await Promise.all([
    supabase
      .from("orders")
      .select("factory_packing_note, delivery_time, ship_out_time")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_lines")
      .select(
        "id, product_name_snapshot, content_snapshot, quantity, is_printed, type_sort, item_order",
      )
      .eq("order_id", orderId)
      .eq("is_void", false)
      .order("type_sort")
      .order("item_order"),
  ])
  if (orderResult.error) {
    throw orderResult.error
  }
  if (linesResult.error) {
    throw linesResult.error
  }

  return {
    packingNote:
      (orderResult.data?.factory_packing_note as string | null)?.trim() || null,
    dispatchTime: clockFromValue(
      (orderResult.data?.ship_out_time as string | null) ?? null,
    ),
    arrivalWindow:
      (orderResult.data?.delivery_time as string | null)?.trim() || null,
    lines: (linesResult.data ?? []).map((row) => ({
      id: row.id as string,
      label: formatFactoryLineLabel({
        productName: row.product_name_snapshot as string | null,
        content: row.content_snapshot as string | null,
        quantity:
          row.quantity == null || row.quantity === ""
            ? null
            : Number(row.quantity),
      }),
      printed: Boolean(row.is_printed),
    })),
  }
}
