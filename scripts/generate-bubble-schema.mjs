import { readFile, writeFile } from "node:fs/promises";

const SWAGGER_URL =
  "https://cs.foodchannels-catering.com/api/1.1/meta/swagger.json";
const OBJECT_TYPES_FILE = new URL(
  "../src/data/bubble-object-types.ts",
  import.meta.url,
);
const OUTPUT_FILE = new URL(
  "../src/data/bubble-schema.generated.json",
  import.meta.url,
);

function normalizedType(value) {
  return value.toLowerCase().replaceAll(" ", "").replaceAll("_", "");
}

function parseSourceTypes(source) {
  const match = source.match(
    /export const BUBBLE_OBJECT_TYPES = (\[[\s\S]*?\]) as const;/,
  );
  if (!match) throw new Error("Unable to parse BUBBLE_OBJECT_TYPES.");
  return JSON.parse(match[1].replace(/,\s*]/, "]"));
}

function referenceFromSchema(schema) {
  const description = schema?.description || "";
  const match = description.match(
    /\('([^']+)' represented by a unique ID\)/,
  );
  return match?.[1] || null;
}

const sourceTypes = parseSourceTypes(
  await readFile(OBJECT_TYPES_FILE, "utf8"),
);
const sourceTypeByNormalized = new Map(
  sourceTypes.map((sourceType) => [normalizedType(sourceType), sourceType]),
);

const response = await fetch(SWAGGER_URL);
if (!response.ok) {
  throw new Error(`Swagger request returned HTTP ${response.status}.`);
}
const swagger = await response.json();

const collectionPaths = Object.keys(swagger.paths)
  .filter((path) => /^\/obj\/[^/]+$/.test(path))
  .sort();

const entities = collectionPaths.map((path) => {
  const schemaType = path.slice("/obj/".length);
  const sourceType =
    sourceTypeByNormalized.get(normalizedType(schemaType)) || schemaType;
  const definition = swagger.definitions?.[schemaType] || {};
  const fields = Object.entries(definition.properties || {}).map(
    ([name, schema]) => {
      const isArray = schema.type === "array";
      const referenceSchema = isArray ? schema.items : schema;
      const targetSchemaType = referenceFromSchema(referenceSchema);
      const targetSourceType = targetSchemaType
        ? sourceTypeByNormalized.get(normalizedType(targetSchemaType)) ||
          targetSchemaType
        : null;

      return {
        name,
        type: schema.type || "unknown",
        format: schema.format || null,
        isArray,
        targetSchemaType,
        targetSourceType,
        isMetadata: name === "Created By",
      };
    },
  );

  return {
    sourceType,
    schemaType,
    path,
    fieldCount: fields.length,
    fields,
  };
});

const relationships = entities.flatMap((entity) =>
  entity.fields
    .filter((field) => field.targetSourceType)
    .map((field) => ({
      sourceType: entity.sourceType,
      sourceSchemaType: entity.schemaType,
      sourceField: field.name,
      targetType: field.targetSourceType,
      targetSchemaType: field.targetSchemaType,
      isArray: field.isArray,
      isMetadata: field.isMetadata,
      inferredCardinality: field.isArray
        ? "many-to-many-candidate"
        : "many-to-one",
      schemaConfidence: "high",
    })),
);

const output = {
  generatedAt: new Date().toISOString(),
  source: SWAGGER_URL,
  entityCount: entities.length,
  fieldCount: entities.reduce((total, entity) => total + entity.fieldCount, 0),
  relationshipCount: relationships.length,
  entities,
  relationships,
};

await writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Generated ${output.entityCount} entities, ${output.fieldCount} fields, ` +
    `${output.relationshipCount} explicit relationships.`,
);

