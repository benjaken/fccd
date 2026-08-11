const SWAGGER_URL =
  "https://cs.foodchannels-catering.com/api/1.1/meta/swagger.json";
const OBJECT_BASE_URL =
  "https://cs.foodchannels-catering.com/api/1.1/obj";
const SAMPLE_SIZE = 100;
const MAX_VERIFY_PER_FIELD = 10;
const MAX_VERIFY_TOTAL = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SwaggerProperty = {
  type?: string;
  format?: string;
  description?: string;
  items?: SwaggerProperty;
};

type SwaggerDocument = {
  definitions?: Record<
    string,
    { properties?: Record<string, SwaggerProperty> }
  >;
  paths?: Record<string, unknown>;
};

type BubbleListResponse = {
  response?: {
    cursor?: number;
    results?: Array<Record<string, unknown>>;
    count?: number;
    remaining?: number;
  };
  message?: string;
};

type RelationshipResult = {
  sourceField: string;
  targetSchemaType: string;
  targetField: string;
  legacySourceField: string;
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

let swaggerPromise: Promise<SwaggerDocument> | null = null;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSwagger() {
  swaggerPromise ??= fetch(SWAGGER_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Swagger returned HTTP ${response.status}.`);
    }
    return (await response.json()) as SwaggerDocument;
  });
  return swaggerPromise;
}

function normalizedType(value: string) {
  return value.toLowerCase().replaceAll(" ", "").replaceAll("_", "");
}

function explicitReference(property: SwaggerProperty) {
  const schema = property.type === "array" ? property.items : property;
  const match = schema?.description?.match(
    /\('([^']+)' represented by a unique ID\)/,
  );
  return match?.[1] ?? null;
}

function sqlName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return /^\d/.test(normalized) ? `field_${normalized}` : normalized;
}

function detailLikeType(schemaType: string) {
  return /^(s_|b_|cal_|quote_)/.test(schemaType);
}

async function fetchBubble(
  url: string,
  bubbleToken: string | undefined,
) {
  const headers: HeadersInit = { Accept: "application/json" };
  if (bubbleToken) headers.Authorization = `Bearer ${bubbleToken}`;
  return fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = (await request.json()) as { sourceType?: unknown };
    if (
      typeof body.sourceType !== "string" ||
      !body.sourceType.trim() ||
      body.sourceType.length > 120
    ) {
      return jsonResponse({ error: "A valid source type is required." }, 400);
    }

    const swagger = await getSwagger();
    const collectionTypes = Object.keys(swagger.paths ?? {})
      .filter((path) => /^\/obj\/[^/]+$/.test(path))
      .map((path) => path.slice("/obj/".length));
    const sourceSchemaType = collectionTypes.find(
      (schemaType) =>
        normalizedType(schemaType) === normalizedType(body.sourceType as string),
    );
    if (!sourceSchemaType) {
      return jsonResponse(
        { error: "Source type is not exposed by the production Swagger." },
        404,
      );
    }

    const properties =
      swagger.definitions?.[sourceSchemaType]?.properties ?? {};
    const schemaRelationships = Object.entries(properties)
      .map(([sourceField, property]) => ({
        sourceField,
        property,
        targetSchemaType: explicitReference(property),
      }))
      .filter(
        (
          relationship,
        ): relationship is {
          sourceField: string;
          property: SwaggerProperty;
          targetSchemaType: string;
        } =>
          Boolean(relationship.targetSchemaType) &&
          relationship.sourceField !== "Created By",
      );

    const bubbleToken = Deno.env.get("BUBBLE_API_TOKEN")?.trim();
    const sourceUrl =
      `${OBJECT_BASE_URL}/${encodeURIComponent(sourceSchemaType)}` +
      `?limit=${SAMPLE_SIZE}&cursor=0`;
    const sourceResponse = await fetchBubble(sourceUrl, bubbleToken);
    const sourcePayload = (await sourceResponse.json().catch(() => null)) as
      | BubbleListResponse
      | null;
    if (
      !sourceResponse.ok ||
      !Array.isArray(sourcePayload?.response?.results)
    ) {
      return jsonResponse(
        {
          error:
            sourcePayload?.message ||
            `Bubble source returned HTTP ${sourceResponse.status}.`,
        },
        sourceResponse.status === 404 ? 404 : 502,
      );
    }

    const records = sourcePayload.response.results;
    const relationshipResults: RelationshipResult[] =
      schemaRelationships.map(
        ({ sourceField, property, targetSchemaType }) => {
          const isArray = property.type === "array";
          const valuesByRecord = records.map((record) => {
            const raw = record[sourceField];
            if (isArray) {
              return Array.isArray(raw)
                ? raw.filter((value): value is string => typeof value === "string")
                : [];
            }
            return typeof raw === "string" && raw ? [raw] : [];
          });
          const values = valuesByRecord.flat();
          const uniqueValues = [...new Set(values)];
          const allScalarValuesUnique =
            !isArray &&
            values.length >= 10 &&
            uniqueValues.length === values.length;

          return {
            sourceField,
            targetSchemaType,
            targetField: isArray
              ? `${sqlName(sourceField)}_junction`
              : `${sqlName(sourceField)}_id`,
            legacySourceField: isArray
              ? `${sqlName(sourceField)}_legacy_ids`
              : `${sqlName(sourceField)}_legacy_id`,
            isArray,
            direction: "outgoing",
            cardinality: isArray
              ? "many-to-many-candidate"
              : allScalarValuesUnique
                ? "one-to-one-candidate"
                : "many-to-one",
            role:
              !isArray && detailLikeType(sourceSchemaType)
                ? "detail-to-master"
                : "reference",
            confidence: values.length ? 90 : 82,
            sampledRecords: records.length,
            populatedRecords: valuesByRecord.filter((values) => values.length > 0)
              .length,
            sampledReferences: values.length,
            uniqueReferences: uniqueValues.length,
            verifiedReferences: 0,
            orphanReferences: 0,
            unverifiedReferences: uniqueValues.length,
            orphanSample: [],
          };
        },
      );

    const incomingRelationships: RelationshipResult[] = collectionTypes.flatMap(
      (childSchemaType) => {
        const childProperties =
          swagger.definitions?.[childSchemaType]?.properties ?? {};
        return Object.entries(childProperties).flatMap(
          ([childField, property]) => {
            const referencedType = explicitReference(property);
            if (
              !referencedType ||
              childField === "Created By" ||
              normalizedType(referencedType) !== normalizedType(sourceSchemaType)
            ) {
              return [];
            }
            const isArray = property.type === "array";
            return [
              {
                sourceField: `${childSchemaType}.${childField}`,
                targetSchemaType: childSchemaType,
                targetField: isArray
                  ? `${sqlName(childField)}_junction`
                  : `${sqlName(childField)}_id`,
                legacySourceField: isArray
                  ? `${sqlName(childField)}_legacy_ids`
                  : `${sqlName(childField)}_legacy_id`,
                isArray,
                direction: "incoming" as const,
                cardinality: isArray
                  ? ("many-to-many-candidate" as const)
                  : ("one-to-many" as const),
                role: "master-to-detail" as const,
                confidence: 84,
                sampledRecords: 0,
                populatedRecords: 0,
                sampledReferences: 0,
                uniqueReferences: 0,
                verifiedReferences: 0,
                orphanReferences: 0,
                unverifiedReferences: 0,
                orphanSample: [],
              },
            ];
          },
        );
      },
    );
    relationshipResults.push(...incomingRelationships);

    const verificationJobs: Array<{
      relationshipIndex: number;
      targetSchemaType: string;
      id: string;
    }> = [];
    let remainingBudget = MAX_VERIFY_TOTAL;
    relationshipResults.forEach((result, relationshipIndex) => {
      if (result.direction === "incoming") return;
      const sourceValues = records.flatMap((record) => {
        const raw = record[result.sourceField];
        if (result.isArray) {
          return Array.isArray(raw)
            ? raw.filter((value): value is string => typeof value === "string")
            : [];
        }
        return typeof raw === "string" && raw ? [raw] : [];
      });
      const values = [...new Set(sourceValues)].slice(
        0,
        Math.min(MAX_VERIFY_PER_FIELD, remainingBudget),
      );
      remainingBudget -= values.length;
      values.forEach((id) =>
        verificationJobs.push({
          relationshipIndex,
          targetSchemaType: result.targetSchemaType,
          id,
        }),
      );
    });

    let nextJob = 0;
    const verificationWorker = async () => {
      while (nextJob < verificationJobs.length) {
        const job = verificationJobs[nextJob++];
        const result = relationshipResults[job.relationshipIndex];
        const targetUrl =
          `${OBJECT_BASE_URL}/${encodeURIComponent(job.targetSchemaType)}/` +
          encodeURIComponent(job.id);
        try {
          const response = await fetchBubble(targetUrl, bubbleToken);
          if (response.ok) {
            result.verifiedReferences += 1;
          } else if (response.status === 404) {
            result.orphanReferences += 1;
            if (result.orphanSample.length < 5) {
              result.orphanSample.push(job.id);
            }
          }
        } catch {
          // Leave transient verification failures as unverified references.
        } finally {
          result.unverifiedReferences = Math.max(
            0,
            result.uniqueReferences -
              result.verifiedReferences -
              result.orphanReferences,
          );
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(8, verificationJobs.length) },
        verificationWorker,
      ),
    );

    relationshipResults.forEach((result) => {
      const checked = result.verifiedReferences + result.orphanReferences;
      if (checked > 0) {
        const validRatio = result.verifiedReferences / checked;
        result.confidence = Math.round(
          Math.max(55, Math.min(99, 88 + validRatio * 11)),
        );
      }
    });

    const responseCursor = sourcePayload.response.cursor ?? 0;
    const responseCount =
      sourcePayload.response.count ?? sourcePayload.response.results.length;
    const remaining = sourcePayload.response.remaining ?? 0;

    return jsonResponse({
      sourceType: body.sourceType,
      sourceSchemaType,
      sourceCount: responseCursor + responseCount + remaining,
      sampleSize: records.length,
      relationshipCount: relationshipResults.length,
      relationships: relationshipResults,
      analyzedAt: new Date().toISOString(),
      privacy: "Only aggregate relationship metadata is returned.",
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Relationship analysis failed.",
      },
      400,
    );
  }
});

