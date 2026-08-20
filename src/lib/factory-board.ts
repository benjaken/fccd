import {
  addCalendarDays,
  clockFromValue,
  fetchDeliveryExportRows,
  hongKongDayStart,
  type DeliveryListItem,
} from "@/lib/deliveries"
import { supabase } from "@/lib/supabase"

export const UNASSIGNED_FLEET_ID = "__unassigned__"
export const ALL_BRAND_ID = "__all__"

export type FactoryBoardData = {
  dates: string[]
  items: FactoryBoardItem[]
  portionsByOrderId: Record<string, number>
  printStatusByOrderId?: Record<string, FactoryOrderPrintStatus>
}

export type FactoryBoardItem = DeliveryListItem & {
  factorySource?: "delivery" | "meat"
  factoryPrintStatus?: FactoryOrderPrintStatus
}

export type FactoryOrderPrintStatus = "complete" | "needs-reprint" | "incomplete"

export type FactoryOrderLine = {
  id: string
  label: string
  quantityText: string | null
  remarks: string[]
  printed: boolean
  requiresReprint?: boolean
}

export type FactoryOrderJob = {
  packingNote: string | null
  dispatchTime: string | null
  arrivalWindow: string | null
  brandName?: string | null
  brandWebsite?: string | null
  requiresReprint?: boolean
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

export type FactoryMultiDayMenuContribution = {
  brandId: string | null
  orderId: string
  orderNumber: string | null
  deliveryDate: string
  deliveryTime: string | null
  label: string
  quantity: number
}

export type FactoryMultiDayMenuOrder = {
  orderId: string
  orderNumber: string | null
  deliveryDate: string
  deliveryTime: string | null
  quantity: number
}

export type FactoryMultiDayMenuRow = {
  label: string
  quantity: number
  orders: FactoryMultiDayMenuOrder[]
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

export function factoryMultiDayRangeLabels(
  startDate: string,
  endDate: string,
  chinese: boolean,
) {
  if (!chinese) return { start: startDate, end: endDate }
  const [startYear, startMonth, startDay] = startDate.split("-")
  const [endYear, endMonth, endDay] = endDate.split("-")
  const start = `${startYear}年${startMonth}月${Number(startDay)}日`
  const end =
    startYear === endYear && startMonth === endMonth
      ? `${Number(endDay)}日`
      : `${endYear}年${endMonth}月${Number(endDay)}日`
  return { start, end }
}

export function factoryMultiDayPrintedDate(
  now = new Date(),
  language = "zh-HK",
) {
  if (!language.startsWith("zh")) {
    return new Intl.DateTimeFormat(language, {
      timeZone: "Asia/Hong_Kong",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
    }).format(now)
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const month = parts.find((part) => part.type === "month")?.value ?? ""
  const day = parts.find((part) => part.type === "day")?.value ?? ""
  const weekday = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    weekday: "long",
  }).format(now)
  return `${month}月${day}日 (${weekday})`
}

export function groupDeliveriesByDate(
  items: FactoryBoardItem[],
  dates: string[],
): Record<string, FactoryBoardItem[]> {
  const grouped: Record<string, FactoryBoardItem[]> = Object.fromEntries(
    dates.map((date) => [date, [] as FactoryBoardItem[]]),
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

type FactoryMeatOrderRow = {
  id: string
  order_number: string | null
  shipping_at: string | null
  order_at: string | null
  print_at: string | null
  meat_customers:
    | { name: string | null }
    | Array<{ name: string | null }>
    | null
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export function mapFactoryMeatOrder(row: FactoryMeatOrderRow): FactoryBoardItem {
  const customer = firstRelation(row.meat_customers)
  return {
    id: row.id,
    orderId: null,
    orderNumber: row.order_number,
    customerName: customer?.name?.trim() || null,
    customerPhone: null,
    address: null,
    deliveryAt: row.shipping_at ?? row.order_at,
    deliveryTime: null,
    districtName: null,
    motorcadeId: null,
    motorcadeName: null,
    shippingMethodId: null,
    shippingMethodName: null,
    basicFee: null,
    totalFee: null,
    surchargeAmount: null,
    surcharges: [],
    grandTotal: null,
    deliveryStatus: null,
    takenAt: null,
    fulfilledAt: null,
    imageReferences: [],
    factorySource: "meat",
    factoryPrintStatus: row.print_at ? "complete" : "incomplete",
  }
}

export async function fetchFactoryMeatOrders(
  startDate: string,
  endDate: string,
): Promise<FactoryBoardItem[]> {
  const { data, error } = await supabase
    .from("meat_orders")
    .select(
      "id,order_number,shipping_at,order_at,print_at,meat_customers(name)",
    )
    .eq("send_to_factory", true)
    .gte("shipping_at", hongKongDayStart(startDate))
    .lt("shipping_at", hongKongDayStart(addCalendarDays(endDate, 1)))
    .order("shipping_at", { ascending: true })
    .order("order_number", { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as FactoryMeatOrderRow[]).map(
    mapFactoryMeatOrder,
  )
}

export function aggregateFactoryMultiDayMenuRows(
  contributions: FactoryMultiDayMenuContribution[],
  activeBrandIds: ReadonlySet<string>,
): FactoryMultiDayMenuRow[] {
  const rows = new Map<
    string,
    { quantity: number; orders: Map<string, FactoryMultiDayMenuOrder> }
  >()

  for (const contribution of contributions) {
    if (!contribution.brandId || !activeBrandIds.has(contribution.brandId)) continue
    const row = rows.get(contribution.label) ?? {
      quantity: 0,
      orders: new Map<string, FactoryMultiDayMenuOrder>(),
    }
    row.quantity += contribution.quantity
    const order = row.orders.get(contribution.orderId) ?? {
      orderId: contribution.orderId,
      orderNumber: contribution.orderNumber,
      deliveryDate: contribution.deliveryDate,
      deliveryTime: contribution.deliveryTime,
      quantity: 0,
    }
    order.quantity += contribution.quantity
    row.orders.set(contribution.orderId, order)
    rows.set(contribution.label, row)
  }

  return [...rows.entries()]
    .map(([label, row]) => ({
      label,
      quantity: row.quantity,
      orders: [...row.orders.values()].sort((left, right) =>
        `${left.deliveryDate}-${left.deliveryTime ?? ""}-${left.orderNumber ?? ""}`
          .localeCompare(
            `${right.deliveryDate}-${right.deliveryTime ?? ""}-${right.orderNumber ?? ""}`,
            "zh-Hant",
          ),
      ),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hant"))
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

export async function fetchFactoryMultiDayMenu(
  startDate: string,
  endDate: string,
): Promise<FactoryMultiDayMenuContribution[]> {
  const deliveries = await fetchDeliveryExportRows({
    search: "",
    startDate,
    endDate,
    motorcadeId: "",
    shippingMethodId: "",
  })
  const orderIds = [
    ...new Set(
      deliveries
        .map((delivery) => delivery.orderId)
        .filter((orderId): orderId is string => Boolean(orderId)),
    ),
  ]
  if (orderIds.length === 0) return []

  const deliveryByOrderId = new Map(
    deliveries
      .filter(
        (delivery): delivery is DeliveryListItem & { orderId: string } =>
          Boolean(delivery.orderId),
      )
      .map((delivery) => [delivery.orderId, delivery]),
  )
  const brandByOrderId = new Map<string, string | null>()
  const contributions: FactoryMultiDayMenuContribution[] = []

  for (let index = 0; index < orderIds.length; index += PORTION_CHUNK_SIZE) {
    const chunk = orderIds.slice(index, index + PORTION_CHUNK_SIZE)
    const { data, error } = await supabase
      .from("orders")
      .select("id, channel_id")
      .in("id", chunk)
    if (error) throw error
    for (const order of data ?? []) {
      brandByOrderId.set(
        order.id as string,
        (order.channel_id as string | null) ?? null,
      )
    }
  }

  for (let index = 0; index < orderIds.length; index += PORTION_CHUNK_SIZE) {
    const chunk = orderIds.slice(index, index + PORTION_CHUNK_SIZE)
    const { data, error } = await supabase
      .from("order_lines")
      .select("order_id, product_name_snapshot, content_snapshot, quantity")
      .in("order_id", chunk)
      .eq("is_void", false)
    if (error) throw error
    for (const line of data ?? []) {
      const orderId = line.order_id as string
      const delivery = deliveryByOrderId.get(orderId)
      if (!delivery?.deliveryAt) continue
      const quantity = Number(line.quantity ?? 0)
      if (!Number.isFinite(quantity) || quantity === 0) continue
      const label = formatFactoryLineLabel({
        productName: line.product_name_snapshot as string | null,
        content: line.content_snapshot as string | null,
        quantity: null,
      })
      if (!label) continue
      contributions.push({
        brandId: brandByOrderId.get(orderId) ?? null,
        orderId,
        orderNumber: delivery.orderNumber,
        deliveryDate: hongKongDateKey(delivery.deliveryAt),
        deliveryTime: delivery.deliveryTime,
        label,
        quantity,
      })
    }
  }

  return contributions
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

export function factoryOrderPrintStatus(input: {
  factoryPrintDate?: string | null
  requiresReprint?: boolean
  lines: Array<{
    isPrinted: boolean
    isVoid: boolean
    modifiedAt?: string | null
  }>
}): FactoryOrderPrintStatus {
  const activeLines = input.lines.filter((line) => !line.isVoid)
  const allPrinted =
    activeLines.length > 0 && activeLines.every((line) => line.isPrinted)
  const printedAt = input.factoryPrintDate
    ? Date.parse(input.factoryPrintDate)
    : Number.NaN
  const modifiedAfterPrint =
    Number.isFinite(printedAt) &&
    input.lines.some((line) => {
      if (!line.modifiedAt) return false
      const modifiedAt = Date.parse(line.modifiedAt)
      return Number.isFinite(modifiedAt) && modifiedAt > printedAt
    })

  if (
    input.requiresReprint ||
    (input.factoryPrintDate && (!allPrinted || modifiedAfterPrint))
  ) {
    return "needs-reprint"
  }
  return allPrinted ? "complete" : "incomplete"
}

async function fetchOrderPrintStatuses(
  orderIds: string[],
): Promise<Record<string, FactoryOrderPrintStatus>> {
  const statuses: Record<string, FactoryOrderPrintStatus> = {}
  if (orderIds.length === 0) return statuses

  const printDateByOrderId = new Map<string, string | null>()
  const reprintByOrderId = new Map<string, boolean>()
  const linesByOrderId = new Map<
    string,
    Array<{ isPrinted: boolean; isVoid: boolean; modifiedAt: string | null }>
  >()

  for (let index = 0; index < orderIds.length; index += PORTION_CHUNK_SIZE) {
    const chunk = orderIds.slice(index, index + PORTION_CHUNK_SIZE)
    const [ordersResult, linesResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id, factory_print_date, factory_reprint_required")
        .in("id", chunk),
      supabase
        .from("order_lines")
        .select("order_id, is_printed, is_void, bubble_modified_at, updated_at")
        .in("order_id", chunk),
    ])
    if (ordersResult.error) throw ordersResult.error
    if (linesResult.error) throw linesResult.error

    for (const order of ordersResult.data ?? []) {
      printDateByOrderId.set(
        order.id as string,
        (order.factory_print_date as string | null) ?? null,
      )
      reprintByOrderId.set(
        order.id as string,
        Boolean(order.factory_reprint_required),
      )
    }
    for (const line of linesResult.data ?? []) {
      const orderId = line.order_id as string
      const lines = linesByOrderId.get(orderId) ?? []
      lines.push({
        isPrinted: Boolean(line.is_printed),
        isVoid: Boolean(line.is_void),
        // Bubble's modification time reflects a real order edit. New local rows
        // do not have it, so updated_at is the fallback for locally-created work.
        modifiedAt:
          (line.bubble_modified_at as string | null) ??
          (line.updated_at as string | null) ??
          null,
      })
      linesByOrderId.set(orderId, lines)
    }
  }

  for (const orderId of orderIds) {
    statuses[orderId] = factoryOrderPrintStatus({
      factoryPrintDate: printDateByOrderId.get(orderId) ?? null,
      requiresReprint: reprintByOrderId.get(orderId) ?? false,
      lines: linesByOrderId.get(orderId) ?? [],
    })
  }
  return statuses
}

export async function fetchFactoryBoard(
  startDate: string,
  days = 3,
): Promise<FactoryBoardData> {
  const dates = factoryVisibleDates(startDate, days)
  const [deliveryItems, meatItems] = await Promise.all([
    fetchDeliveryExportRows({
      search: "",
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      motorcadeId: "",
      shippingMethodId: "",
    }),
    fetchFactoryMeatOrders(dates[0]!, dates[dates.length - 1]!),
  ])
  const items: FactoryBoardItem[] = [
    ...deliveryItems.map((item) => ({ ...item, factorySource: "delivery" as const })),
    ...meatItems,
  ]
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
    printStatusByOrderId: await fetchOrderPrintStatuses(orderIds),
  }
}

export async function fetchFactoryOrderJob(orderId: string): Promise<FactoryOrderJob> {
  const [orderResult, linesResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "factory_packing_note, delivery_time, ship_out_time, factory_print_date, factory_reprint_required, channels(name,website)",
      )
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_lines")
      .select(
        "id, product_name_snapshot, content_snapshot, quantity, new_quantity_text, remarks_1, remarks_2, is_printed, is_void, bubble_modified_at, updated_at, type_sort, item_order",
      )
      .eq("order_id", orderId)
      .order("type_sort")
      .order("item_order"),
  ])
  if (orderResult.error) {
    throw orderResult.error
  }
  if (linesResult.error) {
    throw linesResult.error
  }

  const factoryPrintDate =
    (orderResult.data?.factory_print_date as string | null) ?? null
  const channelValue = orderResult.data?.channels as
    | { name: string | null; website: string | null }
    | Array<{ name: string | null; website: string | null }>
    | null
    | undefined
  const channel = Array.isArray(channelValue)
    ? (channelValue[0] ?? null)
    : (channelValue ?? null)
  const allLines = linesResult.data ?? []
  const requiresReprint =
    Boolean(orderResult.data?.factory_reprint_required) ||
    factoryOrderPrintStatus({
      factoryPrintDate,
      lines: allLines.map((row) => ({
        isPrinted: Boolean(row.is_printed),
        isVoid: Boolean(row.is_void),
        modifiedAt:
          (row.bubble_modified_at as string | null) ??
          (row.updated_at as string | null) ??
          null,
      })),
    }) === "needs-reprint"

  return {
    packingNote:
      (orderResult.data?.factory_packing_note as string | null)?.trim() || null,
    dispatchTime: clockFromValue(
      (orderResult.data?.ship_out_time as string | null) ?? null,
    ),
    arrivalWindow:
      (orderResult.data?.delivery_time as string | null)?.trim() || null,
    brandName: channel?.name?.trim() || null,
    brandWebsite: channel?.website?.trim() || null,
    requiresReprint,
    lines: allLines.filter((row) => !row.is_void).map((row) => ({
      id: row.id as string,
      label: formatFactoryLineLabel({
        productName: row.product_name_snapshot as string | null,
        content: row.content_snapshot as string | null,
        quantity: null,
      }),
      quantityText:
        (row.new_quantity_text as string | null)?.trim() ||
        formatFactoryQuantity(
          row.quantity == null || row.quantity === ""
            ? null
            : Number(row.quantity),
        ),
      remarks: [row.remarks_1, row.remarks_2]
        .map((value) => (value as string | null)?.trim() ?? "")
        .filter((value, index, values) => value && values.indexOf(value) === index),
      printed: Boolean(row.is_printed),
      requiresReprint:
        requiresReprint &&
        (!row.is_printed ||
          (Boolean(factoryPrintDate) &&
            Date.parse(
              ((row.bubble_modified_at as string | null) ??
                (row.updated_at as string | null) ??
                ""),
            ) > Date.parse(factoryPrintDate ?? ""))),
    })),
  }
}

function escapeFactoryLabelHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function buildFactoryDishLabelHtml(input: {
  orderNumber: string
  dish: string
  quantity: string | null
  remarks: string[]
  deliveryDate: string
  deliveryTime: string | null
  packingNote: string | null
}): string {
  const remarks = input.remarks
    .map((remark) => `<div class="remark">${escapeFactoryLabelHtml(remark)}</div>`)
    .join("")
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:100mm 50mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Microsoft JhengHei","Noto Sans CJK TC",sans-serif;color:#000}.label{width:100mm;height:50mm;padding:4mm;display:flex;flex-direction:column;justify-content:center;text-align:center}.dish{font-size:20pt;font-weight:800;line-height:1.2}.qty{font-size:17pt;font-weight:800;margin-top:2mm}.remark{font-size:15pt;font-weight:800;margin-top:1.5mm}.meta{display:flex;justify-content:space-between;margin-top:2.5mm;font-size:9pt;font-weight:700}.packing{margin-top:1mm;font-size:9pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style></head><body><main class="label"><div class="dish">${escapeFactoryLabelHtml(input.dish)}</div>${input.quantity ? `<div class="qty">× ${escapeFactoryLabelHtml(input.quantity)}</div>` : ""}${remarks}<div class="meta"><span>#${escapeFactoryLabelHtml(input.orderNumber.replace(/^#/, ""))}</span><span>${escapeFactoryLabelHtml(input.deliveryDate)} ${escapeFactoryLabelHtml(input.deliveryTime ?? "")}</span></div>${input.packingNote ? `<div class="packing">${escapeFactoryLabelHtml(input.packingNote)}</div>` : ""}</main></body></html>`
}

export async function markFactoryOrderLinePrinted(lineId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_factory_order_line_printed", {
    p_order_line_id: lineId,
  })
  if (error) throw error
}
