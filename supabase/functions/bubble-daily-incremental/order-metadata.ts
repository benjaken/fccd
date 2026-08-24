import type { BubbleRecord } from "./helpers.ts";
import { requireLegacyId } from "./helpers.ts";

export type LegacyOrderMetadata = {
  orderLegacyId: string;
  tagLegacyIds: string[];
  districtLegacyId: string | null;
};

function legacyId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function orderMetadataFromRecord(
  record: BubbleRecord,
): LegacyOrderMetadata {
  const tagLegacyIds = Array.isArray(record.ORDER_tag)
    ? [...new Set(record.ORDER_tag.flatMap((value) => {
        const id = legacyId(value);
        return id ? [id] : [];
      }))]
    : [];

  return {
    orderLegacyId: requireLegacyId(record),
    tagLegacyIds,
    districtLegacyId: legacyId(record["Delivery_DS_Deli District"]),
  };
}

export function fallbackDeliveryLegacyId(orderLegacyId: string): string {
  return `bubble-order-fallback-delivery-${orderLegacyId}`;
}
