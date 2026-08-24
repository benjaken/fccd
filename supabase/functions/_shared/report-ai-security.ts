export type ReportAiScalar = string | number | boolean | null;
export type ReportAiRow = Record<string, ReportAiScalar>;
export type ReportAiSnapshot = {
  filters: Record<string, ReportAiScalar | ReportAiScalar[]>;
  currentAggregates: ReportAiRow[];
  comparisonAggregates?: ReportAiRow[];
  detailRows?: ReportAiRow[];
  completeness: {
    status: "complete" | "partial" | "unknown";
    latestDataAt?: string;
    notes?: string[];
  };
};

type ReportFieldAllowlist = {
  filters: readonly string[];
  rows: readonly string[];
};

const REPORT_FIELD_ALLOWLISTS: Record<string, ReportFieldAllowlist> = {
  kitchenSalesCost: {
    filters: ["selectedYears"],
    rows: ["year", "month", "category", "amount"],
  },
  kitchenChannelSales: {
    filters: ["selectedYears"],
    rows: ["year", "month", "channel", "amount"],
  },
  kitchenProductSales: {
    filters: ["startDate", "endDate", "brandId", "productTypeName", "collectionId"],
    rows: [
      "rowType", "productId", "sku", "productName", "brandName",
      "categoryName", "productSetName", "quantity", "totalAmount",
    ],
  },
  kitchenAdvertisingPerformance: {
    filters: ["mode", "segmentKey", "selectedYears"],
    rows: ["year", "segmentKey", "segmentLabel", "channel", "metric", "amount"],
  },
  shopSales: {
    filters: ["period", "category", "startDate", "endDate"],
    rows: [
      "bucketStart", "restaurantId", "restaurantName", "restaurantOrder",
      "categoryKey", "categoryName", "categoryOrder", "amount",
    ],
  },
  shopSalesWorkingHours: {
    filters: ["startDate", "endDate", "restaurantIds"],
    rows: [
      "reportDate", "restaurantId", "restaurantName", "departmentName",
      "departmentOrder", "sales", "workingHours", "salesPerWorkingHour",
    ],
  },
  restaurantSalesSalary: {
    filters: ["startMonth", "endMonth", "restaurantIds"],
    rows: [
      "monthStart", "restaurantId", "restaurantName", "sales", "salary",
      "salaryToSalesPercent",
    ],
  },
  restaurantSalesCost: {
    filters: ["startMonth", "endMonth", "restaurantId"],
    rows: [
      "monthStart", "restaurantName", "sales", "openingStock", "purchases",
      "closingStock", "costOfSales", "grossProfit", "supplierName",
      "restaurantPurchases", "waterBarPurchases", "miscPurchases", "totalPurchases",
    ],
  },
  restaurantPnl: {
    filters: ["startMonth", "endMonth", "restaurantId"],
    rows: [
      "monthStart", "restaurantId", "restaurantName", "sales", "openingStock",
      "purchases", "closingStock", "categoryKey", "categoryName", "categoryOrder",
      "itemKey", "itemName", "itemOrder", "amount",
    ],
  },
  newProducts: {
    filters: ["startDate", "endDate", "page", "pageSize"],
    rows: ["saleDate", "productId", "productName", "quantity"],
  },
  shopOrderQuantities: {
    filters: ["startDate", "endDate", "shopId", "shopName"],
    rows: [
      "orderDate", "shopName", "productName", "unit", "quantity", "sharePercent",
    ],
  },
  averageSupplyPrice: {
    filters: ["year", "priceUnit", "selectedProductId", "priceMode"],
    rows: [
      "productId", "productName", "productUnit", "month", "pricePerKg",
      "pricePerPackage",
    ],
  },
  productionCostPrice: {
    filters: ["year", "priceUnit", "selectedProductId", "priceMode"],
    rows: [
      "productId", "productName", "productUnit", "month", "pricePerKg",
      "pricePerPackage",
    ],
  },
  rawMeatAveragePrice: {
    filters: ["year", "selectedRawMeatId"],
    rows: [
      "rawMeatItemId", "rawMeatName", "month", "averagePricePerKg",
      "totalQuantityKg", "receiptCount",
    ],
  },
  preparedMeatStock: {
    filters: ["year", "stockKind", "selectedItemId"],
    rows: [
      "itemId", "itemName", "productUnit", "monthNumber", "monthEndStock",
      "monthlyNetStock",
    ],
  },
  rawMeatStock: {
    filters: ["year", "stockKind", "selectedItemId"],
    rows: [
      "itemId", "itemName", "productUnit", "monthNumber", "monthEndStock",
      "monthlyNetStock",
    ],
  },
  supplierPurchase: {
    filters: ["startDate", "endDate", "supplierId", "supplierName"],
    rows: [
      "supplierName", "rawMeatName", "quantityKg", "purchaseAmount",
      "averagePricePerKg",
    ],
  },
};

const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}(?:-\d{2})?(?:T[\d:.+-]+Z?)?$/;

function safeScalar(value: unknown): value is ReportAiScalar {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" &&
    value.length <= 200 &&
    !EMAIL_PATTERN.test(value) &&
    (ISO_DATE_PATTERN.test(value) || !PHONE_PATTERN.test(value));
}

function sanitizeValue(value: unknown) {
  if (Array.isArray(value)) return value.filter(safeScalar).slice(0, 100);
  return safeScalar(value) ? value : undefined;
}

function pickFields(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
): Record<string, ReportAiScalar | ReportAiScalar[]> {
  return Object.fromEntries(
    allowedFields.flatMap((field) => {
      const sanitized = sanitizeValue(value[field]);
      return sanitized === undefined ? [] : [[field, sanitized]];
    }),
  );
}

function pickRowFields(
  value: ReportAiRow,
  allowedFields: readonly string[],
): ReportAiRow {
  return Object.fromEntries(
    allowedFields.flatMap((field) => {
      const candidate = value[field];
      return safeScalar(candidate) ? [[field, candidate]] : [];
    }),
  );
}

export function trustedReportAiRole(
  appMetadata: Record<string, unknown> | null | undefined,
) {
  return typeof appMetadata?.role === "string" ? appMetadata.role : "";
}

export function reportAiLimitExceeded(
  requestCount: number,
  maximumRequests: number,
  trustedRole: string,
) {
  return trustedRole !== "Super Admin" && requestCount >= maximumRequests;
}

export function sanitizeReportAiSnapshot(
  reportKey: string,
  snapshot: ReportAiSnapshot,
): ReportAiSnapshot {
  const allowlist = REPORT_FIELD_ALLOWLISTS[reportKey];
  if (!allowlist) {
    return {
      filters: {},
      currentAggregates: [],
      comparisonAggregates: [],
      detailRows: [],
      completeness: { status: "unknown" },
    };
  }

  const sanitizeRows = (rows: ReportAiRow[] | undefined) =>
    (rows ?? []).map((row) => pickRowFields(row, allowlist.rows));
  const latestDataAt = snapshot.completeness.latestDataAt;

  return {
    filters: pickFields(snapshot.filters, allowlist.filters),
    currentAggregates: sanitizeRows(snapshot.currentAggregates),
    comparisonAggregates: sanitizeRows(snapshot.comparisonAggregates),
    detailRows: sanitizeRows(snapshot.detailRows),
    completeness: {
      status: snapshot.completeness.status,
      ...(typeof latestDataAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(latestDataAt)
        ? { latestDataAt }
        : {}),
    },
  };
}
