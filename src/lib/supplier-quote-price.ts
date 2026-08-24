export type SupplierQuotePriceNormalization = {
  sourcePrice: number | null;
  sourceUnit: string | null;
  sourceUnitLabel: string | null;
  unitWeightKg: number | null;
  unitsPerContainer: number | null;
  containerPrice: number | null;
  containerWeightKg: number | null;
  comparablePricePerKg: number | null;
  conversionIssue: string | null;
};

type CanonicalPriceUnit = "kg" | "box" | "unit" | "pack";

const RAW_PRICE_UNIT = /(?:\/|\bper\b)\s*(kg|kgs?|kilograms?|公斤|box|boxes|case|cases|ctn|cartons?|箱|盒|unit|units?|pcs?|pieces?|件|pack|packs|pkg|packages?|包|bags?|bottles?|jars?|cans?|tins?|trays?|pouches?|squeezers?|cups?|pets?)\b/i;
const MASS = /(\d+(?:[.,]\d+)?)\s*(kg|kgs?|kilograms?|g|grams?|lb|lbs?|pounds?|oz|ounces?|公斤|千克|克|磅|安士|斤)\b/i;

function canonicalPriceUnit(value: string | null | undefined): CanonicalPriceUnit | null {
  if (!value) return null;
  if (/^(?:kg|kgs?|kilograms?|公斤)$/i.test(value)) return "kg";
  if (/^(?:box|boxes|case|cases|ctn|cartons?|箱|盒)$/i.test(value)) return "box";
  if (/^(?:pack|packs|pkg|packages?|包|bags?)$/i.test(value)) return "pack";
  if (/^(?:unit|units?|pcs?|pieces?|件|bottles?|jars?|cans?|tins?|trays?|pouches?|squeezers?|cups?|pets?)$/i.test(value)) return "unit";
  return null;
}

function massToKg(text: string | null | undefined) {
  const match = String(text ?? "").match(MASS);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2].toLowerCase();
  if (/^kg|kilogram|公斤|千克/.test(unit)) return amount;
  if (/^g|gram|克/.test(unit)) return amount / 1000;
  if (/^lb|pound|磅/.test(unit)) return amount * 0.45359237;
  if (/^oz|ounce|安士/.test(unit)) return amount * 0.028349523125;
  if (unit === "斤") return amount * 0.60478982;
  return null;
}

function unitsPerContainer(text: string | null | undefined) {
  const value = String(text ?? "");
  const multiplied = value.match(/(?:^|\D)(\d+(?:\.\d+)?)\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|kgs?|g|grams?|lb|lbs?|oz|公斤|千克|克|磅|安士|斤)\b/i);
  if (multiplied) return Number(multiplied[1]);
  const counted = value.match(/(?:^|\D)(\d+(?:\.\d+)?)\s*(?:units?|pcs?|pieces?|packs?|pkgs?|packages?|bags?|bottles?|jars?|cans?|tins?|trays?|pouches?|squeezers?|cups?|pets?|件|包|袋|瓶|罐|盒)\s*(?:\/|per|每)\s*(?:cartons?|ctn|cases?|boxes?|箱)/i);
  return counted ? Number(counted[1]) : null;
}

export function normalizeSupplierQuotePrice(input: {
  price: number | null;
  priceUnit: string | null | undefined;
  rawPriceText?: string | null;
  sizeText?: string | null;
  packingText?: string | null;
}): SupplierQuotePriceNormalization {
  const rawUnitLabel = String(input.rawPriceText ?? "").match(RAW_PRICE_UNIT)?.[1] ?? null;
  const sourceUnit = canonicalPriceUnit(input.priceUnit) ?? canonicalPriceUnit(rawUnitLabel);
  const unitWeightKg = massToKg(input.sizeText) ?? massToKg(input.packingText);
  const count = unitsPerContainer(input.packingText);
  const containerWeightKg = unitWeightKg !== null && count !== null ? unitWeightKg * count : null;
  let comparablePricePerKg: number | null = null;
  let conversionIssue: string | null = null;

  if (input.price === null || !Number.isFinite(input.price) || input.price <= 0) {
    conversionIssue = "valid_positive_price_required";
  } else if (sourceUnit === "kg") {
    comparablePricePerKg = input.price;
  } else if ((sourceUnit === "unit" || sourceUnit === "pack") && unitWeightKg !== null) {
    comparablePricePerKg = input.price / unitWeightKg;
  } else if (sourceUnit === "box" && containerWeightKg !== null) {
    comparablePricePerKg = input.price / containerWeightKg;
  } else if (!sourceUnit) {
    conversionIssue = "price_unit_requires_review";
  } else {
    conversionIssue = "weight_per_price_unit_requires_review";
  }

  return {
    sourcePrice: input.price,
    sourceUnit,
    sourceUnitLabel: rawUnitLabel ?? input.priceUnit ?? null,
    unitWeightKg,
    unitsPerContainer: count,
    containerPrice: input.price !== null && count !== null
      ? sourceUnit === "box" ? input.price : input.price * count
      : null,
    containerWeightKg,
    comparablePricePerKg,
    conversionIssue,
  };
}
