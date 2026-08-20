import { supabase } from "@/lib/supabase";

export const KITCHEN_UNASSIGNED_CHANNEL = "Unassigned";

export const KITCHEN_CHANNEL_ORDER = [
  "Catering",
  "Kitchen",
  "Express",
  "Cuisine",
  "Delivery",
  "Residential",
  "HK lunch box",
  "HK Party Food",
] as const;

export type KitchenChannelSalesReportRow = {
  year: number;
  month: number;
  channel: string;
  amount: number;
};

export type KitchenChannelSalesReport = {
  rows: KitchenChannelSalesReportRow[];
};

export type KitchenChannelSalesYearSummary = {
  year: number;
  sales: Record<string, number[]>;
  channelTotals: Record<string, number>;
  monthlyTotals: number[];
  totalSales: number;
};

type KitchenChannelSalesRpcRow = {
  report_year: number | string;
  month_number: number | string;
  channel_name: string | null;
  amount: number | string | null;
};

function numericValue(value: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function canonicalChannelName(value: string) {
  const trimmed = value.trim();
  const known = KITCHEN_CHANNEL_ORDER.find(
    (channel) => channel.toLowerCase() === trimmed.toLowerCase(),
  );
  return known ?? trimmed;
}

export async function fetchKitchenChannelSalesReport(): Promise<KitchenChannelSalesReport> {
  const { data, error } = await supabase.rpc("report_kitchen_channel_sales");
  if (error) throw new Error(error.message);

  return {
    rows: ((data ?? []) as KitchenChannelSalesRpcRow[])
      .map((row) => ({
        year: Number(row.report_year),
        month: Number(row.month_number),
        channel: canonicalChannelName(
          row.channel_name?.trim() || KITCHEN_UNASSIGNED_CHANNEL,
        ),
        amount: numericValue(row.amount),
      }))
      .filter(
        (row) =>
          Number.isInteger(row.year) &&
          row.year > 1900 &&
          row.month >= 1 &&
          row.month <= 12,
      ),
  };
}

export function kitchenChannelSalesYears(rows: KitchenChannelSalesReportRow[]) {
  return [...new Set(rows.map((row) => row.year))].sort(
    (left, right) => left - right,
  );
}

export function defaultKitchenChannelSalesYears(years: number[]) {
  const available = new Set(years);
  const preferred = [2025, 2026].filter((year) => available.has(year));
  return preferred.length > 0 ? preferred : years.slice(-2);
}

export function kitchenChannelSalesChannels(
  rows: KitchenChannelSalesReportRow[],
) {
  const configured = [
    ...new Set(
      rows
        .map((row) => canonicalChannelName(row.channel))
        .filter(Boolean),
    ),
  ];
  const known = [...KITCHEN_CHANNEL_ORDER].filter((channel) =>
    configured.some((item) => item.toLowerCase() === channel.toLowerCase()),
  );
  const extra = configured
    .filter(
      (channel) =>
        !known.some((item) => item.toLowerCase() === channel.toLowerCase()),
    )
    .sort((left, right) => left.localeCompare(right));
  return [...known, ...extra];
}

export function buildKitchenChannelSalesYearSummary(
  rows: KitchenChannelSalesReportRow[],
  year: number,
  channels = kitchenChannelSalesChannels(rows),
): KitchenChannelSalesYearSummary {
  const sales = Object.fromEntries(
    channels.map((channel) => [
      channel,
      Array.from({ length: 12 }, () => 0),
    ]),
  ) as Record<string, number[]>;

  for (const row of rows) {
    if (row.year !== year || row.month < 1 || row.month > 12) continue;
    const channel = canonicalChannelName(row.channel);
    if (sales[channel]) sales[channel][row.month - 1] += row.amount;
  }

  const monthlyTotals = Array.from({ length: 12 }, (_, monthIndex) =>
    channels.reduce((total, channel) => total + sales[channel][monthIndex], 0),
  );
  const channelTotals = Object.fromEntries(
    channels.map((channel) => [
      channel,
      sales[channel].reduce((total, amount) => total + amount, 0),
    ]),
  ) as Record<string, number>;

  return {
    year,
    sales,
    channelTotals,
    monthlyTotals,
    totalSales: monthlyTotals.reduce((total, amount) => total + amount, 0),
  };
}
