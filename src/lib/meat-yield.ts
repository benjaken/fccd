export const YIELD_ERROR_THRESHOLD_RATIO = 0.15;
export const YIELD_FORMULA_VERSION = "historical_packs_per_kg_ceiling_v1";

export type MeatYieldEstimateInput = {
  rawInputKg: number;
  historicalPacks: number;
  historicalRawKg: number;
  kgPerPackage?: number | null;
};

export type MeatYieldEstimate = {
  rawInputKg: number;
  historicalPacks: number;
  historicalRawKg: number;
  packsPerKg: number | null;
  kgPerPackage: number | null;
  expectedOutputKg: number | null;
  expectedPacks: number | null;
  formulaVersion: string;
};

export type MeatYieldErrorCheck = {
  isError: boolean;
  deviationPacks: number | null;
  deviationRatio: number | null;
  direction: "over" | "under" | null;
};

/**
 * Bubble 生肉出貨 「預算收成」 (Text on the prepared-meat inbound row):
 *
 * ceiling(
 *   Σ(M_doneMeat_stock in/包)
 *   / Σ(from_rawStock_list out_quantity(kg))
 *   × current outbound kg
 * )
 *
 * current outbound kg is ReceiveData A's column_1_list :sum.
 */
export function estimatePreparedMeatYield(
  input: MeatYieldEstimateInput,
): MeatYieldEstimate {
  const historicalPacks = input.historicalPacks;
  const historicalRawKg = input.historicalRawKg;
  const packsPerKg =
    historicalRawKg > 0 && Number.isFinite(historicalPacks)
      ? historicalPacks / historicalRawKg
      : null;
  const rawExpected =
    packsPerKg === null || !Number.isFinite(input.rawInputKg)
      ? null
      : packsPerKg * input.rawInputKg;
  const expectedPacks =
    rawExpected === null || rawExpected <= 0
      ? null
      : Math.ceil(rawExpected - 1e-12);
  const kgPerPackage = input.kgPerPackage ?? null;
  const expectedOutputKg =
    expectedPacks === null || kgPerPackage === null || kgPerPackage <= 0
      ? rawExpected
      : expectedPacks * kgPerPackage;

  return {
    rawInputKg: input.rawInputKg,
    historicalPacks,
    historicalRawKg,
    packsPerKg,
    kgPerPackage,
    expectedOutputKg,
    expectedPacks,
    formulaVersion: YIELD_FORMULA_VERSION,
  };
}

export function shouldRecordMeatYieldError(
  actualPacks: number,
  expectedPacks: number | null,
  thresholdRatio = YIELD_ERROR_THRESHOLD_RATIO,
): MeatYieldErrorCheck {
  if (
    expectedPacks === null ||
    !Number.isFinite(expectedPacks) ||
    expectedPacks === 0 ||
    !Number.isFinite(actualPacks)
  ) {
    return {
      isError: false,
      deviationPacks: null,
      deviationRatio: null,
      direction: null,
    };
  }

  const deviationPacks = actualPacks - expectedPacks;
  const deviationRatio = deviationPacks / expectedPacks;
  const isError = Math.abs(deviationRatio) > thresholdRatio;

  return {
    isError,
    deviationPacks,
    deviationRatio,
    direction: deviationPacks === 0 ? null : deviationPacks > 0 ? "over" : "under",
  };
}
