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
  if (typeof value !== "string" || !value.trim()) return;
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
  metadataMigrated: references,
  binaryMigrated: 0,
  checksumVerified: 0,
  failed: 0,
  ownerEstimatedMinimum: 5000,
  discoveryGapMinimum: Math.max(0, 5000 - uniqueReferences.size),
  incrementalPolicy: {
    filter: "Modified Date > lastSuccessfulCheckpoint",
    dedupeKey: "source URL + target object path + checksum",
    batchSize: 100,
    resumable: true,
  },
  byField,
};

await writeFile(
  "src/data/file-migration-status.generated.json",
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(
  `Generated ${output.uniqueFiles} unique files from ${output.references} references.`,
);
