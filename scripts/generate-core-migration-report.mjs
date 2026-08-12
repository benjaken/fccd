import { readFile, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../.migration-data/", import.meta.url);
const MANIFEST_FILE = new URL("export-manifest.json", DATA_DIR);
const SCHEMA_FILE = new URL(
  "../src/data/bubble-schema.generated.json",
  import.meta.url,
);
const OUTPUT_FILE = new URL(
  "../docs/CORE_MIGRATION_DATA_REPORT.md",
  import.meta.url,
);

function valueType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

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

function numberSum(records, field) {
  return records.reduce(
    (total, record) =>
      total + (typeof record[field] === "number" ? record[field] : 0),
    0,
  );
}

function money(value) {
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 2,
  }).format(value);
}

function markdownCell(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

const manifest = JSON.parse(await readFile(MANIFEST_FILE, "utf8"));
const schema = JSON.parse(await readFile(SCHEMA_FILE, "utf8"));

const recordsByType = new Map();
const idSetsByType = new Map();
const duplicateIdsByType = new Map();
const exportByType = new Map(
  manifest.exports.map((item) => [item.type, item]),
);

for (const item of manifest.exports) {
  const content = await readFile(new URL(`objects/${item.file}`, DATA_DIR), "utf8");
  const records = content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const ids = new Set();
  const duplicates = new Set();
  for (const record of records) {
    if (typeof record._id !== "string") continue;
    if (ids.has(record._id)) duplicates.add(record._id);
    ids.add(record._id);
  }
  recordsByType.set(item.type, records);
  idSetsByType.set(item.type, ids);
  duplicateIdsByType.set(item.type, duplicates);
}

const selectedTypes = [...recordsByType.keys()].sort();
const entitiesBySchemaType = new Map(
  schema.entities.map((entity) => [entity.schemaType, entity]),
);
const sourceCountByType = new Map(
  await Promise.all(
    selectedTypes.map(async (type) => {
      const response = await fetch(
        `https://cs.foodchannels-catering.com/api/1.1/obj/${encodeURIComponent(type)}?limit=1&cursor=0`,
      );
      const payload = await response.json();
      const result = payload.response ?? {};
      const sourceCount =
        (result.cursor ?? 0) +
        (result.count ?? result.results?.length ?? 0) +
        (result.remaining ?? 0);
      return [type, sourceCount];
    }),
  ),
);

const entityRows = selectedTypes.map((type) => {
  const records = recordsByType.get(type);
  const exported = exportByType.get(type);
  const entity = entitiesBySchemaType.get(type);
  const populatedFields = new Set(
    records.flatMap((record) =>
      Object.entries(record)
        .filter(([, value]) => value !== null && value !== "")
        .map(([field]) => field),
    ),
  );
  return {
    type,
    sourceRecords: sourceCountByType.get(type) ?? null,
    records: records.length,
    manifestRecords: exported?.records ?? 0,
    fields: entity?.fieldCount ?? 0,
    populatedFields: populatedFields.size,
    duplicates: duplicateIdsByType.get(type).size,
    missingRecords: Math.max(
      0,
      (sourceCountByType.get(type) ?? records.length) - records.length,
    ),
  };
});

const typeMismatches = [];
for (const type of selectedTypes) {
  const entity = entitiesBySchemaType.get(type);
  const records = recordsByType.get(type);
  if (!entity) continue;
  for (const field of entity.fields) {
    const populated = records
      .map((record) => record[field.name])
      .filter((value) => value !== undefined && value !== null && value !== "");
    const mismatches = populated.filter(
      (value) => !expectedTypeMatches(field.type, value),
    );
    if (mismatches.length) {
      typeMismatches.push({
        type,
        field: field.name,
        expected: field.type,
        observed: [...new Set(mismatches.map(valueType))].join(", "),
        mismatchCount: mismatches.length,
      });
    }
  }
}

const relationshipRows = [];
for (const relationship of schema.relationships.filter(
  (item) =>
    selectedTypes.includes(item.sourceSchemaType) && !item.isMetadata,
)) {
  const records = recordsByType.get(relationship.sourceSchemaType);
  const valuesByRecord = records.map((record) => {
    const raw = record[relationship.sourceField];
    if (relationship.isArray) {
      return Array.isArray(raw)
        ? raw.filter((value) => typeof value === "string" && value)
        : [];
    }
    return typeof raw === "string" && raw ? [raw] : [];
  });
  const values = valuesByRecord.flat();
  const uniqueValues = [...new Set(values)];
  const targetIds = idSetsByType.get(relationship.targetSchemaType);
  const orphanIds = targetIds
    ? uniqueValues.filter((value) => !targetIds.has(value))
    : [];
  const resolved = targetIds
    ? uniqueValues.length - orphanIds.length
    : null;
  const cardinality = relationship.isArray
    ? "候选多对多"
    : values.length >= 10 && uniqueValues.length === values.length
      ? "候选一对一"
      : "多对一";
  const confidence = targetIds
    ? orphanIds.length === 0
      ? "高"
      : "中"
    : values.length
      ? "中"
      : "Schema-only";

  relationshipRows.push({
    source: relationship.sourceSchemaType,
    field: relationship.sourceField,
    target: relationship.targetSchemaType,
    cardinality,
    populatedRecords: valuesByRecord.filter((values) => values.length).length,
    references: values.length,
    uniqueReferences: uniqueValues.length,
    resolved,
    orphans: targetIds ? orphanIds.length : null,
    orphanSample: orphanIds.slice(0, 3).join(", "),
    confidence,
  });
}

const orders = recordsByType.get("a_order") ?? [];
const payments = recordsByType.get("s_payment") ?? [];
const orderLines = recordsByType.get("s_order") ?? [];
const voidLines = orderLines.filter((record) => record.Void === true);

const lines = [
  "# Production Bubble 核心数据分析报告",
  "",
  "> 本报告由 production Data API 导出的本地数据生成。",
  "> 仅包含聚合统计和 Bubble ID 对账样本，不包含客户、订单或付款原始内容。",
  "",
  "## 1. 执行摘要",
  "",
  `- 分析类型：${selectedTypes.length}`,
  `- 导出记录：${entityRows.reduce((total, row) => total + row.records, 0).toLocaleString()}`,
  `- 当前来源记录：${entityRows.reduce((total, row) => total + (row.sourceRecords ?? 0), 0).toLocaleString()}`,
  `- 尚未导出记录：${entityRows.reduce((total, row) => total + row.missingRecords, 0).toLocaleString()}`,
  `- Manifest 错误：${manifest.errors.length}`,
  `- 重复 Bubble \`_id\`：${entityRows.reduce((total, row) => total + row.duplicates, 0)}`,
  `- 显式关系字段：${relationshipRows.length}`,
  `- 实际类型不符字段：${typeMismatches.length}`,
  "",
  "## 2. 数据类型与记录数",
  "",
  "| Bubble 类型 | 当前来源 | Manifest | 本地记录 | 完成率 | Schema 字段 | 有值字段 | 重复 ID |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...entityRows.map(
    (row) => {
      const completion = row.sourceRecords
        ? `${((row.records / row.sourceRecords) * 100).toFixed(1)}%`
        : row.records === 0
          ? "100.0%"
          : "—";
      return `| \`${row.type}\` | ${(row.sourceRecords ?? 0).toLocaleString()} | ${row.manifestRecords.toLocaleString()} | ${row.records.toLocaleString()} | ${completion} | ${row.fields} | ${row.populatedFields} | ${row.duplicates} |`;
    },
  ),
  "",
  "### 不完整导出",
  "",
];

const incompleteRows = entityRows.filter((row) => row.missingRecords > 0);
if (incompleteRows.length) {
  lines.push(
    "| 类型 | 当前来源 | 已导出 | 尚缺 | 原因／处理 |",
    "|---|---:|---:|---:|---|",
    ...incompleteRows.map(
      (row) =>
        `| \`${row.type}\` | ${(row.sourceRecords ?? 0).toLocaleString()} | ${row.records.toLocaleString()} | ${row.missingRecords.toLocaleString()} | Bubble cursor 50,000 边界；需要按日期或 ID 分区导出 |`,
    ),
    "",
  );
} else {
  lines.push("- 所有选择类型均已完整导出。", "");
}

lines.push(
  "## 3. 关系完整性",
  "",
  "| 来源 | Bubble 字段 | 目标 | 推断基数 | 有值记录 | 引用值 | 唯一引用 | 已解析 | 孤儿 | 置信度 |",
  "|---|---|---|---|---:|---:|---:|---:|---:|---|",
  ...relationshipRows.map(
    (row) =>
      `| \`${row.source}\` | \`${markdownCell(row.field)}\` | \`${row.target}\` | ${row.cardinality} | ${row.populatedRecords} | ${row.references} | ${row.uniqueReferences} | ${row.resolved ?? "目标未导出"} | ${row.orphans ?? "—"} | ${row.confidence} |`,
  ),
  "",
  "### 孤儿引用样本",
  "",
);

const orphanRows = relationshipRows.filter((row) => (row.orphans ?? 0) > 0);
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
  lines.push("- 已导出目标范围内未发现孤儿引用。");
}

lines.push(
  "",
  "## 4. 金额与交易摘要",
  "",
  `- \`a_order\` ORDER_Grand total 合计：${money(numberSum(orders, "ORDER_Grand total"))}`,
  `- \`a_order\` ORDER_oustanding 合计：${money(numberSum(orders, "ORDER_oustanding"))}`,
  `- \`a_order\` ORDER_折扣(-) 合计：${money(numberSum(orders, "ORDER_折扣(-)"))}`,
  `- \`a_order\` ORDER_運費(+) 合计：${money(numberSum(orders, "ORDER_運費(+)"))}`,
  `- \`s_payment\` Amount 合计：${money(numberSum(payments, "Amount"))}`,
  `- \`s_order\` Void 明细：${voidLines.length.toLocaleString()} / ${orderLines.length.toLocaleString()}`,
  "",
  "以上金额只是来源字段直接加总，不代表已完成业务对账；退款、Void、",
  "Payout、Cashdollar 与历史公式仍需业务规则确认。不完整导出的类型不会",
  "代表全量金额或明细结果。",
  "",
  "## 5. Swagger 与实际类型差异",
  "",
);

if (typeMismatches.length) {
  lines.push(
    "| 类型 | 字段 | Swagger | 实际类型 | 不符记录 |",
    "|---|---|---|---|---:|",
    ...typeMismatches.map(
      (item) =>
        `| \`${item.type}\` | \`${markdownCell(item.field)}\` | ${item.expected} | ${item.observed} | ${item.mismatchCount} |`,
    ),
  );
} else {
  lines.push("- 已导出范围内未发现 Swagger primitive type 与实际值不符。");
}

lines.push(
  "",
  "## 6. 导入前结论",
  "",
  "- 当前报告只验证已导出的 12 个核心／基础类型。",
  "- 关系与金额统计只覆盖本地已导出记录；不完整类型必须分区补齐后重算。",
  "- 目标未导出的关系只能标记为 Schema 推断，不能判断孤儿。",
  "- Bubble ID 必须先保存为 `legacy_id text`，再解析为 Supabase UUID FK。",
  "- 所有孤儿、重复 ID、金额差异及字段类型差异处理完成后，才能写入 develop。",
  "- `user.pw` 不在本次导出范围，后续也不得迁移。",
  "",
  "## 7. 下一步建议",
  "",
  "1. 补导关系报告中标记为「目标未导出」的 lookup 类型。",
  "2. 对完整目标 ID 集重新执行孤儿检查。",
  "3. 确认订单、付款、Void、Outstanding 与 Cashdollar 公式。",
  "4. 审批 `docs/MIGRATION_SCHEMA_DRAFT.md`。",
  "5. 只在 Supabase develop 建立正式 schema 并进行小批量试导入。",
);

await writeFile(OUTPUT_FILE, `${lines.join("\n")}\n`);
console.log(
  `Generated report for ${selectedTypes.length} types and ` +
    `${entityRows.reduce((total, row) => total + row.records, 0)} records.`,
);

