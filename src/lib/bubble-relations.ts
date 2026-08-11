import { supabase } from "@/lib/supabase";

const mainRelationshipFunctionUrl =
  "https://vignxasvlxqnyvuhtjlu.supabase.co/functions/v1/bubble-relations";

export type BubbleRelationship = {
  sourceField: string;
  targetSchemaType: string;
  targetField: string;
  isArray: boolean;
  direction: "outgoing" | "incoming";
  cardinality:
    | "one-to-many"
    | "many-to-one"
    | "one-to-one-candidate"
    | "many-to-many-candidate";
  role: "master-to-detail" | "detail-to-master" | "reference";
  confidence: number;
  sampledRecords: number;
  populatedRecords: number;
  sampledReferences: number;
  uniqueReferences: number;
  verifiedReferences: number;
  orphanReferences: number;
  unverifiedReferences: number;
  orphanSample: string[];
};

export type BubbleRelationshipReport = {
  sourceType: string;
  sourceSchemaType: string;
  sourceCount: number;
  sampleSize: number;
  relationshipCount: number;
  relationships: BubbleRelationship[];
  analyzedAt: string;
  privacy: string;
};

export async function analyzeBubbleRelationships(sourceType: string) {
  const { data, error } = await supabase.functions.invoke("bubble-relations", {
    body: { sourceType },
  });

  if (error) {
    const fallbackResponse = await fetch(mainRelationshipFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType }),
    });
    const fallbackData = await fallbackResponse.json().catch(() => null);
    if (!fallbackResponse.ok) {
      throw new Error(
        typeof fallbackData?.error === "string"
          ? fallbackData.error
          : error.message || "Relationship analysis failed.",
      );
    }
    return fallbackData as BubbleRelationshipReport;
  }
  if (!data || !Array.isArray(data.relationships)) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Relationship analyzer returned an unexpected response.",
    );
  }
  return data as BubbleRelationshipReport;
}

