import {
  fetchKitchenChannelSalesReport,
  kitchenChannelSalesChannels,
  type KitchenChannelSalesReportRow,
} from "@/lib/kitchen-channel-sales-report";
import {
  fetchRestaurantSalesReport,
  type RestaurantSalesReportRow,
} from "@/lib/restaurant-sales-report";

export type HomeSalesPeriodKey =
  | "previousYearPreviousMonth"
  | "previousYearCurrentMonth"
  | "previousMonth"
  | "currentMonth";

export type HomeSalesPeriod = {
  key: HomeSalesPeriodKey;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
};

export type HomeSalesComparisonRow = {
  id: string;
  name: string;
  values: Record<HomeSalesPeriodKey, number>;
};

export type HomeSalesDashboardData = {
  asOfDate: string;
  periods: HomeSalesPeriod[];
  cateringChannels: HomeSalesComparisonRow[];
  tkoChannels: HomeSalesComparisonRow[];
};

export const HOME_CATERING_CORE_CHANNELS = [
  { id: "Catering", abbreviation: "FCC" },
  { id: "HK lunch box", abbreviation: "FCB" },
  { id: "Kitchen", abbreviation: "FCK" },
  { id: "Express", abbreviation: "FCE" },
  { id: "HK Party Food", abbreviation: "FCP" },
] as const;

export const HOME_TKO_CORE_PLATFORMS = [
  { id: "foodpanda", name: "Food Panda" },
  { id: "keeta", name: "Keeta" },
  { id: "openrice", name: "Openrice" },
  { id: "other", name: "其他" },
] as const;

const EXTRA_CATERING_ABBREVIATIONS: Array<{ test: RegExp; abbreviation: string }> = [
  { test: /cuisine|福滿樓/, abbreviation: "FCL" },
  { test: /delivery/, abbreviation: "FCD" },
  { test: /residential/, abbreviation: "FCR" },
];

function dateValue(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthPeriod(
  key: HomeSalesPeriodKey,
  year: number,
  month: number,
): HomeSalesPeriod {
  return {
    key,
    year,
    month,
    startDate: dateValue(year, month, 1),
    endDate: dateValue(year, month, new Date(year, month, 0).getDate()),
  };
}

export function homeSalesPeriods(now = new Date()): HomeSalesPeriod[] {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const previous = new Date(year, month - 2, 1);

  return [
    monthPeriod(
      "previousYearPreviousMonth",
      previous.getFullYear() - 1,
      previous.getMonth() + 1,
    ),
    monthPeriod("previousYearCurrentMonth", year - 1, month),
    monthPeriod(
      "previousMonth",
      previous.getFullYear(),
      previous.getMonth() + 1,
    ),
    monthPeriod("currentMonth", year, month),
  ];
}

function emptyValues(): Record<HomeSalesPeriodKey, number> {
  return {
    previousYearPreviousMonth: 0,
    previousYearCurrentMonth: 0,
    previousMonth: 0,
    currentMonth: 0,
  };
}

function periodKeyFor(
  periods: HomeSalesPeriod[],
  year: number,
  month: number,
) {
  return periods.find(
    (period) => period.year === year && period.month === month,
  )?.key;
}

function isTkoRestaurant(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized.includes("tko") || normalized.includes("將軍澳");
}

function compactChannelKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function cateringChannelAbbreviation(name: string) {
  const compact = compactChannelKey(name);
  if (/lunchbox|hklunchbox|飯盒/.test(compact)) return "FCB";
  if (/partyfood|hkpartyfood/.test(compact)) return "FCP";
  if (compact === "kitchen" || compact === "fck" || compact.includes("foodchannelkitchen")) {
    return "FCK";
  }
  if (compact === "express" || compact === "fce") return "FCE";
  for (const extra of EXTRA_CATERING_ABBREVIATIONS) {
    if (extra.test.test(compact) || extra.test.test(name)) return extra.abbreviation;
  }
  if (
    compact === "catering" ||
    compact === "fcc" ||
    compact.includes("foodchannelcatering")
  ) {
    return "FCC";
  }
  return name.trim() || name;
}

export function tkoPlatformBucket(categoryKey: string, categoryName: string) {
  const compact = compactChannelKey(`${categoryKey} ${categoryName}`);
  if (compact.includes("foodpanda")) return HOME_TKO_CORE_PLATFORMS[0];
  if (compact.includes("keeta")) return HOME_TKO_CORE_PLATFORMS[1];
  if (compact.includes("openrice")) return HOME_TKO_CORE_PLATFORMS[2];
  return HOME_TKO_CORE_PLATFORMS[3];
}

function comparisonRow(id: string, name: string): HomeSalesComparisonRow {
  return { id, name, values: emptyValues() };
}

export function buildHomeSalesDashboard(
  cateringRows: KitchenChannelSalesReportRow[],
  restaurantRows: RestaurantSalesReportRow[],
  now = new Date(),
): HomeSalesDashboardData {
  const periods = homeSalesPeriods(now);
  const cateringMap = new Map<string, HomeSalesComparisonRow>();

  for (const channel of HOME_CATERING_CORE_CHANNELS) {
    cateringMap.set(channel.id, comparisonRow(channel.id, channel.abbreviation));
  }

  for (const channel of kitchenChannelSalesChannels(cateringRows)) {
    if (cateringMap.has(channel)) continue;
    cateringMap.set(
      channel,
      comparisonRow(channel, cateringChannelAbbreviation(channel)),
    );
  }

  for (const row of cateringRows) {
    const key = periodKeyFor(periods, row.year, row.month);
    if (!key) continue;
    const item = cateringMap.get(row.channel) ?? comparisonRow(
      row.channel,
      cateringChannelAbbreviation(row.channel),
    );
    item.values[key] += row.amount;
    cateringMap.set(row.channel, item);
  }

  const tkoChannelMap = new Map<string, HomeSalesComparisonRow>();
  for (const platform of HOME_TKO_CORE_PLATFORMS) {
    tkoChannelMap.set(platform.id, comparisonRow(platform.id, platform.name));
  }

  for (const row of restaurantRows) {
    if (row.categoryKey === "__total__" || !isTkoRestaurant(row.restaurantName)) {
      continue;
    }
    const bucket = new Date(`${row.bucketStart}T00:00:00`);
    const key = periodKeyFor(
      periods,
      bucket.getFullYear(),
      bucket.getMonth() + 1,
    );
    if (!key) continue;
    const platform = tkoPlatformBucket(row.categoryKey, row.categoryName);
    const item = tkoChannelMap.get(platform.id) ?? comparisonRow(platform.id, platform.name);
    item.values[key] += row.amount;
    tkoChannelMap.set(platform.id, item);
  }

  const cateringOrder = [
    ...HOME_CATERING_CORE_CHANNELS.map((channel) => channel.id),
    ...[...cateringMap.keys()].filter(
      (id) => !HOME_CATERING_CORE_CHANNELS.some((channel) => channel.id === id),
    ),
  ];

  return {
    asOfDate: dateValue(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    periods,
    cateringChannels: cateringOrder
      .map((id) => cateringMap.get(id))
      .filter((row): row is HomeSalesComparisonRow => Boolean(row)),
    tkoChannels: HOME_TKO_CORE_PLATFORMS.map(
      (platform) => tkoChannelMap.get(platform.id) ?? comparisonRow(platform.id, platform.name),
    ),
  };
}

export async function fetchHomeSalesDashboard(
  now = new Date(),
): Promise<HomeSalesDashboardData> {
  const periods = homeSalesPeriods(now);
  const startDate = periods[0].startDate;
  const endDate = periods[periods.length - 1].endDate;
  const [cateringReport, restaurantRows] = await Promise.all([
    fetchKitchenChannelSalesReport(),
    fetchRestaurantSalesReport({
      startDate,
      endDate,
      period: "month",
      category: "platform",
    }),
  ]);

  return buildHomeSalesDashboard(
    cateringReport.rows,
    restaurantRows,
    now,
  );
}
