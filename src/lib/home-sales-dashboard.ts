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

export function buildHomeSalesDashboard(
  cateringRows: KitchenChannelSalesReportRow[],
  restaurantRows: RestaurantSalesReportRow[],
  now = new Date(),
): HomeSalesDashboardData {
  const periods = homeSalesPeriods(now);
  const cateringMap = new Map<string, HomeSalesComparisonRow>();

  for (const channel of kitchenChannelSalesChannels(cateringRows)) {
    cateringMap.set(channel, {
      id: channel,
      name: channel,
      values: emptyValues(),
    });
  }

  for (const row of cateringRows) {
    const key = periodKeyFor(periods, row.year, row.month);
    if (!key) continue;
    const item = cateringMap.get(row.channel) ?? {
      id: row.channel,
      name: row.channel,
      values: emptyValues(),
    };
    item.values[key] += row.amount;
    cateringMap.set(row.channel, item);
  }

  const tkoChannelMap = new Map<string, HomeSalesComparisonRow>();
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
    const item = tkoChannelMap.get(row.categoryKey) ?? {
      id: row.categoryKey,
      name: row.categoryName,
      values: emptyValues(),
    };
    item.values[key] += row.amount;
    tkoChannelMap.set(row.categoryKey, item);
  }

  const byCurrentThenName = (
    left: HomeSalesComparisonRow,
    right: HomeSalesComparisonRow,
  ) =>
    right.values.currentMonth - left.values.currentMonth ||
    left.name.localeCompare(right.name, "zh-HK");

  return {
    asOfDate: dateValue(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    periods,
    cateringChannels: [...cateringMap.values()].sort(byCurrentThenName),
    tkoChannels: [...tkoChannelMap.values()].sort(byCurrentThenName),
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
