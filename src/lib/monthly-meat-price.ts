/** Round to four decimal places, matching meat_price_versions numeric(14, 4). */
export function roundMeatPrice(value: number) {
  return Math.round(value * 10000) / 10000;
}

export type MonthlyMeatOutboundPriceInput = {
  outboundKg: number;
  inboundUnitPrice: number;
  seasoningPerKg: number | null;
  yieldKg: number;
  /** Snapshotted applied_variation_rate (工場 1 + rate). */
  variationRate: number | null;
  /** Snapshotted applied_markup_rate (店舖 extra 1 + rate). */
  markupRate: number | null;
};

/**
 * One outbound / production-day unit price.
 *
 * 工場 = (入庫金額 + 出庫kg × 香料/kg) × (1 + variation) ÷ 收成kg
 * 店舖 = 工場 × (1 + markup)
 */
export function computeMonthlyMeatUnitPrices(input: MonthlyMeatOutboundPriceInput) {
  if (input.outboundKg <= 0 || input.yieldKg <= 0) return null;

  const inboundAmount = input.outboundKg * input.inboundUnitPrice;
  const seasoningCost = input.outboundKg * (input.seasoningPerKg ?? 0);
  const variation = input.variationRate ?? 0;
  const markup = input.markupRate ?? 0;
  const roomPrice =
    ((inboundAmount + seasoningCost) * (1 + variation)) / input.yieldKg;
  const shopPrice = roomPrice * (1 + markup);

  if (!Number.isFinite(roomPrice) || !Number.isFinite(shopPrice)) return null;

  return { roomPrice, shopPrice };
}

/**
 * Simple arithmetic mean of per-outbound unit prices (not kg-weighted).
 */
export function averageMonthlyMeatPrices(
  rows: Array<{ roomPrice: number; shopPrice: number }>,
) {
  if (rows.length === 0) return null;

  const roomSum = rows.reduce((sum, row) => sum + row.roomPrice, 0);
  const shopSum = rows.reduce((sum, row) => sum + row.shopPrice, 0);

  return {
    roomPrice: roundMeatPrice(roomSum / rows.length),
    shopPrice: roundMeatPrice(shopSum / rows.length),
  };
}
