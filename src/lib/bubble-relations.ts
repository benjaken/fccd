import { supabase } from "@/lib/supabase";

export type BubbleRelationship = {
  sourceField: string;
  targetSchemaType: string;
  targetField: string;
  isArray: boolean;
  cardinality:
    | "many-to-one"
    | "one-to-one-candidate"
    | "many-to-many-candidate";
  role: "detail-to-master" | "reference";
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
    throw new Error(error.message || "Relationship analysis failed.");
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

