import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const DATA_DIR = pathToFileURL(
  `${resolve(process.env.MIGRATION_DATA_DIR ?? ".migration-data")}/`,
);
const MANIFEST_FILE = new URL("export-manifest.json", DATA_DIR);
const SCHEMA_FILE = new URL(
  "../src/data/bubble-schema.generated.json",
  import.meta.url,
);
const OUTPUT_FILE = new URL(
  "../docs/FULL_MIGRATION_DATA_REPORT.md",
  import.meta.url,
);
const OBJECT_BASE_URL =
  "https://cs.foodchannels-catering.com/api/1.1/obj";

function expectedTypeMatches(expected, value) {
  if (expected === "option set") return typeof value === "string";
  if (expected === "number") return typeof value === "number";
  if (expected === "boolean") return typeof value === "boolean";
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  return typeof value === "string";
}

function valueType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function markdownCell(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function money(value) {
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 2,
  }).format(value);
}

async function forEachRecord(file, callback) {
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let index = 0;
  for await (const line of lines) {
    if (!line) continue;
    await callback(JSON.parse(line), index++);
  }
  return index;
}

async function fetchSourceCounts(types, snapshotAt) {
  const counts = new Map();
  let next = 0;
  const worker = async () => {
    while (next < types.length) {
      const type = types[next++];
      const query = new URLSearchParams({ limit: "1", cursor: "0" });
      if (snapshotAt) {
        query.set(
          "constraints",
          JSON.stringify([
            {
              key: "Created Date",
              constraint_type: "less than",
              value: snapshotAt,
            },
          ]),
        );
      }
      const response = await fetch(
        `${OBJECT_BASE_URL}/${encodeURIComponent(type)}?${query}`,
      );
      const payload = await response.json();
      const result = payload.response ?? {};
      const count =
        (result.cursor ?? 0) +
        (result.count ?? result.results?.length ?? 0) +
        (result.remaining ?? 0);
      counts.set(type, response.ok ? count : null);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return counts;
}

const manifest = JSON.parse(await readFile(MANIFEST_FILE, "utf8"));
const schema = JSON.parse(await readFile(SCHEMA_FILE, "utf8"));
const exportByType = new Map(
  manifest.exports.map((item) => [item.type, item]),
);
const selectedTypes = [...exportByType.keys()].sort();
const sourceCounts = await fetchSourceCounts(
  selectedTypes,
  manifest.snapshotAt,
);
const entitiesByType = new Map(
  schema.entities.map((entity) => [entity.schemaType, entity]),
);

const idSets = new Map();
const entityRows = [];
const mismatchRows = [];
const financial = {
  grandTotal: 0,
  outstanding: 0,
  discount: 0,
  shipping: 0,
  payments: 0,
  orderLines: 0,
  voidLines: 0,
};

for (const type of selectedTypes) {
  const item = exportByType.get(type);
  const entity = entitiesByType.get(type);
  const ids = new Set();
  const duplicates = new Set();
  const populatedFields = new Set();
  const fieldDefinitions = new Map(
    (entity?.fields ?? []).map((field) => [field.name, field]),
  );
  const mismatchByField = new Map();

  const localRecords = await forEachRecord(
    new URL(`objects/${item.file}`, DATA_DIR),
    (record) => {
      if (typeof record._id === "string") {
        if (ids.has(record._id)) duplicates.add(record._id);
        ids.add(record._id);
      }
      for (const [fieldName, value] of Object.entries(record)) {
        if (value === null || value === undefined || value === "") continue;
        populatedFields.add(fieldName);
        const definition = fieldDefinitions.get(fieldName);
        if (definition && !expectedTypeMatches(definition.type, value)) {
          const mismatch = mismatchByField.get(fieldName) ?? {
            expected: definition.type,
            observed: new Set(),
            count: 0,
          };
          mismatch.observed.add(valueType(value));
          mismatch.count += 1;
          mismatchByField.set(fieldName, mismatch);
        }
      }

      if (type === "a_order") {
        financial.grandTotal +=
          typeof record["ORDER_Grand total"] === "number"
            ? record["ORDER_Grand total"]
            : 0;
        financial.outstanding +=
          typeof record.ORDER_oustanding === "number"
            ? record.ORDER_oustanding
            : 0;
        financial.discount +=
          typeof record["ORDER_折扣(-)"] === "number"
            ? record["ORDER_折扣(-)"]
            : 0;
        financial.shipping +=
          typeof record["ORDER_運費(+)"] === "number"
            ? record["ORDER_運費(+)"]
            : 0;
      } else if (type === "s_payment") {
        financial.payments +=
          typeof record.Amount === "number" ? record.Amount : 0;
      } else if (type === "s_order") {
        financial.orderLines += 1;
        if (record.Void === true) financial.voidLines += 1;
      }
    },
  );

  for (const [field, mismatch] of mismatchByField) {
    mismatchRows.push({
      type,
      field,
      expected: mismatch.expected,
      observed: [...mismatch.observed].join(", "),
      count: mismatch.count,
    });
  }

  const sourceRecords = sourceCounts.get(type);
  entityRows.push({
    type,
    sourceRecords,
    manifestRecords: item.records,
    localRecords,
    missing:
      sourceRecords === null ? null : Math.max(0, sourceRecords - localRecords),
    fields: entity?.fieldCount ?? 0,
    populatedFields: populatedFields.size,
    duplicates: duplicates.size,
  });
  idSets.set(type, ids);
}

const relationships = schema.relationships
  .filter(
    (relationship) =>
      selectedTypes.includes(relationship.sourceSchemaType) &&
      !relationship.isMetadata,
  )
  .map((relationship) => ({
    ...relationship,
    populatedRecords: 0,
    referenceCount: 0,
    uniqueValues: new Set(),
  }));

const relationshipsBySource = new Map();
for (const relationship of relationships) {
  const entries = relationshipsBySource.get(relationship.sourceSchemaType) ?? [];
  entries.push(relationship);
  relationshipsBySource.set(relationship.sourceSchemaType, entries);
}

for (const [sourceType, sourceRelationships] of relationshipsBySource) {
  const item = exportByType.get(sourceType);
  await forEachRecord(new URL(`objects/${item.file}`, DATA_DIR), (record) => {
    for (const relationship of sourceRelationships) {
      const raw = record[relationship.sourceField];
      const values = relationship.isArray
        ? Array.isArray(raw)
          ? raw.filter((value) => typeof value === "string" && value)
          : []
        : typeof raw === "string" && raw
          ? [raw]
          : [];
      if (values.length) relationship.populatedRecords += 1;
      relationship.referenceCount += values.length;
      values.forEach((value) => relationship.uniqueValues.add(value));
    }
  });
}

const relationshipRows = relationships.map((relationship) => {
  const values = [...relationship.uniqueValues];
  const targetIds = idSets.get(relationship.targetSchemaType);
  const orphanIds = targetIds
    ? values.filter((value) => !targetIds.has(value))
    : [];
  const resolved = targetIds ? values.length - orphanIds.length : null;
  return {
    source: relationship.sourceSchemaType,
    field: relationship.sourceField,
    target: relationship.targetSchemaType,
    cardinality: relationship.isArray
      ? "候选多对多"
      : relationship.referenceCount >= 10 &&
          values.length === relationship.referenceCount
        ? "候选一对一"
        : "多对一",
    populatedRecords: relationship.populatedRecords,
    references: relationship.referenceCount,
    uniqueReferences: values.length,
    resolved,
    orphans: targetIds ? orphanIds.length : null,
    orphanSample: orphanIds.slice(0, 3).join(", "),
    confidence: targetIds
      ? orphanIds.length
        ? "中"
        : "高"
      : relationship.referenceCount
        ? "中"
        : "Schema-only",
  };
});

const incompleteRows = entityRows.filter(
  (row) => row.missing === null || row.missing > 0,
);
const orphanRows = relationshipRows.filter((row) => (row.orphans ?? 0) > 0);
const exportedTotal = entityRows.reduce(
  (total, row) => total + row.localRecords,
  0,
);
const knownSourceTotal = entityRows.reduce(
  (total, row) => total + (row.sourceRecords ?? 0),
  0,
);
const missingTotal = entityRows.reduce(
  (total, row) => total + (row.missing ?? 0),
  0,
);

const lines = [
  "# Production Bubble 全量数据分析报告",
  "",
  "> 本报告由 production Data API 的 Git-ignored 本地导出生成。",
  "> 报告仅提交聚合统计与 Bubble ID 对账样本，不提交原始业务记录。",
  "",
  "## 1. 执行摘要",
  "",
  `- Production Swagger 实体：${schema.entityCount}`,
  `- 快照时间：${manifest.snapshotAt ?? "未固定（不建议）"}`,
  `- 已导出类型：${selectedTypes.length}`,
  `- 当前可读取来源记录：${knownSourceTotal.toLocaleString()}`,
  `- 本地导出记录：${exportedTotal.toLocaleString()}`,
  `- 尚未导出记录：${missingTotal.toLocaleString()}`,
  `- API／Manifest 错误：${manifest.errors.length}`,
  `- 重复 Bubble \`_id\`：${entityRows.reduce((sum, row) => sum + row.duplicates, 0)}`,
  `- 显式关系字段：${relationshipRows.length}`,
  `- 实际 primitive type 不符字段：${mismatchRows.length}`,
  "",
  "## 2. 类型与导出完整性",
  "",
  "| Bubble 类型 | 当前来源 | Manifest | 本地记录 | 完成率 | 字段 | 有值字段 | 重复 ID |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...entityRows.map((row) => {
    const completion =
      row.sourceRecords === null
        ? "API 错误"
        : row.sourceRecords === 0
          ? "100.0%"
          : `${((row.localRecords / row.sourceRecords) * 100).toFixed(1)}%`;
    return `| \`${row.type}\` | ${row.sourceRecords?.toLocaleString() ?? "—"} | ${row.manifestRecords.toLocaleString()} | ${row.localRecords.toLocaleString()} | ${completion} | ${row.fields} | ${row.populatedFields} | ${row.duplicates} |`;
  }),
  "",
  "### 不完整／不可读取类型",
  "",
];

if (incompleteRows.length) {
  lines.push(
    "| 类型 | 当前来源 | 已导出 | 尚缺 |",
    "|---|---:|---:|---:|",
    ...incompleteRows.map(
      (row) =>
        `| \`${row.type}\` | ${row.sourceRecords?.toLocaleString() ?? "API 错误"} | ${row.localRecords.toLocaleString()} | ${row.missing?.toLocaleString() ?? "—"} |`,
    ),
  );
} else {
  lines.push("- 所有 production Swagger 类型均已完整导出。");
}

lines.push(
  "",
  "## 3. 全量关系与孤儿检查",
  "",
  "| 来源 | Bubble 字段 | 目标 | 基数 | 有值记录 | 引用 | 唯一引用 | 已解析 | 孤儿 | 置信度 |",
  "|---|---|---|---|---:|---:|---:|---:|---:|---|",
  ...relationshipRows.map(
    (row) =>
      `| \`${row.source}\` | \`${markdownCell(row.field)}\` | \`${row.target}\` | ${row.cardinality} | ${row.populatedRecords} | ${row.references} | ${row.uniqueReferences} | ${row.resolved ?? "目标不可用"} | ${row.orphans ?? "—"} | ${row.confidence} |`,
  ),
  "",
  "### 孤儿引用",
  "",
);

if (orphanRows.length) {
  lines.push(
    "| 来源字段 | 目标 | 孤儿数 | Bubble ID 样本 |",
    "|---|---|---:|---|",
    ...orphanRows.map(
      (row) =>
        `| \`${row.source}.${markdownCell(row.field)}\` | \`${row.target}\` | ${row.orphans} | \`${markdownCell(row.orphanSample)}\` |`,
    ),
  );
} else {
  lines.push("- 已导出且可读取的目标范围内未发现孤儿引用。");
}

lines.push(
  "",
  "## 4. 金额与交易摘要",
  "",
  `- \`a_order\` ORDER_Grand total：${money(financial.grandTotal)}`,
  `- \`a_order\` ORDER_oustanding：${money(financial.outstanding)}`,
  `- \`a_order\` ORDER_折扣(-)：${money(financial.discount)}`,
  `- \`a_order\` ORDER_運費(+)：${money(financial.shipping)}`,
  `- \`s_payment\` Amount：${money(financial.payments)}`,
  `- \`s_order\` Void：${financial.voidLines.toLocaleString()} / ${financial.orderLines.toLocaleString()}`,
  "",
  "以上仅为来源字段直接加总，不等于业务规则对账结果。",
  "",
  "## 5. Swagger 与实际类型差异",
  "",
);

if (mismatchRows.length) {
  lines.push(
    "| 类型 | 字段 | Swagger | 实际类型 | 不符记录 |",
    "|---|---|---|---|---:|",
    ...mismatchRows.map(
      (row) =>
        `| \`${row.type}\` | \`${markdownCell(row.field)}\` | ${row.expected} | ${row.observed} | ${row.count} |`,
    ),
  );
} else {
  lines.push("- 未发现 Swagger primitive type 与实际值不符。");
}

lines.push(
  "",
  "## 6. 导入就绪判断",
  "",
  `- 来源数量完整：${incompleteRows.length ? "否" : "是"}`,
  `- 重复 legacy ID 为零：${entityRows.every((row) => row.duplicates === 0) ? "是" : "否"}`,
  `- 可验证目标的孤儿为零：${orphanRows.length ? "否" : "是"}`,
  `- Primitive type 一致：${mismatchRows.length ? "否" : "是"}`,
  "- UUID crosswalk：尚未执行",
  "- 金额业务对账：尚未签核",
  "- 文件 checksum 对账：尚未执行",
  "- User/Auth 迁移：尚未执行，`user.pw` 永不迁移",
  "",
  "## 7. 建议下一步",
  "",
  "1. 处理不可读取或目标不可用的关系类型。",
  "2. 审批实体分类及 `docs/MIGRATION_SCHEMA_DRAFT.md`。",
  "3. 确认订单、付款、Void、Outstanding 与 Cashdollar 公式。",
  "4. 在 Supabase develop 建立 schema，并先导入 lookup/master 小批次。",
  "5. 执行 UUID crosswalk、全量孤儿、数量、金额及文件对账。",
);

await writeFile(OUTPUT_FILE, `${lines.join("\n")}\n`);
console.log(
  `Generated full report for ${selectedTypes.length} types and ` +
    `${exportedTotal} records.`,
);

