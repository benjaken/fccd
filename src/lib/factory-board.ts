import {
  addCalendarDays,
  fetchDeliveryExportRows,
  type DeliveryListItem,
  type DeliveryLookupOption,
} from "@/lib/deliveries"
import { supabase } from "@/lib/supabase"

export const UNASSIGNED_FLEET_ID = "__unassigned__"

export type FactoryBoardData = {
  dates: string[]
  items: DeliveryListItem[]
  portionsByOrderId: Record<string, number>
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

export async function fetchFactoryFleets(): Promise<DeliveryLookupOption[]> {
  const { data, error } = await supabase
    .from("delivery_teams")
    .select("id, name, short_name, is_active")
    .eq("is_active", true)
    .order("name")
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name:
      (row.short_name as string | null)?.trim() ||
      (row.name as string | null)?.trim() ||
      (row.id as string),
  }))
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
