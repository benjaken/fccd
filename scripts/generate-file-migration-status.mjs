import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const dataDir = ".migration-data/full-snapshot";
const manifest = JSON.parse(
  await readFile(`${dataDir}/export-manifest.json`, "utf8"),
);
const fileFieldPattern =
  /(file|image|photo|logo|sheet|attachment|font|bold|regular)/i;
const groups = new Map();
const uniqueReferences = new Set();
let references = 0;

function collect(value, groupKey) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collect(entry, groupKey));
    return;
  }
  if (typeof value !== "string" || !value.trim().startsWith("//")) return;
  references += 1;
  uniqueReferences.add(value.trim());
  groups.set(groupKey, (groups.get(groupKey) ?? 0) + 1);
}

for (const item of manifest.exports) {
  const lines = createInterface({
    input: createReadStream(`${dataDir}/objects/${item.file}`, {
      encoding: "utf8",
    }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line) continue;
    const record = JSON.parse(line);
    for (const [field, value] of Object.entries(record)) {
      if (fileFieldPattern.test(field)) {
        collect(value, `${item.type}.${field}`);
      }
    }
  }
}

const byField = [...groups]
  .map(([field, count]) => ({ field, count }))
  .sort((left, right) => right.count - left.count);

const output = {
  snapshotAt: manifest.snapshotAt,
  sourceTypes: manifest.exports.length,
  references,
  uniqueFiles: uniqueReferences.size,
  expectedFiles: 4198,
  inventoryComplete: false,
  attachmentRows: 0,
  binaryMigrated: 0,
  checksumVerified: 0,
  failed: 0,
  discoveryGap: Math.max(0, 4198 - uniqueReferences.size),
  pageSize: 50,
  incrementalPolicy: {
    filter: "Modified Date > lastSuccessfulCheckpoint",
    dedupeKey: "source URL hash + private object path + checksum",
    concurrency: "4–8",
    resumable: true,
    automaticDeletes: false,
  },
  byField,
  safeSamples: byField.map(({ field, count }, index) => ({
    sampleId: `aggregate-${index + 1}`,
    fileName: `Redacted ${field.split(".").at(-1)} aggregate`,
    size: null,
    type: /(logo|image|png|svg)/i.test(field) ? "Image" : "Document",
    uploadDate: null,
    userId: "••••••••",
    attachedTo: field.split(".")[0],
    status: `Discovered only · ${count.toLocaleString()} references`,
    private: true,
  })),
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (/https?:|\/\/[^*]|(?:^|["\s])\d{10,}x\d{10,}(?:["\s]|$)/m.test(serialized)) {
  throw new Error(
    "Refusing to emit a generated frontend file containing URLs or full Bubble IDs",
  );
}

await writeFile(
  "src/data/file-migration-status.generated.json",
  serialized,
);
console.log(
  `Generated ${output.uniqueFiles} unique files from ${output.references} references.`,
);
