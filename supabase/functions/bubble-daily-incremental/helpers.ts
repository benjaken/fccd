export type BubbleRecord = Record<string, unknown> & {
  _id?: string;
  "Created Date"?: string;
  "Modified Date"?: string;
};

function canonicalValue(value: unknown, inArray = false): string | undefined {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }
  if (Array.isArray(value)) {
    return `[${
      value.map((item) => canonicalValue(item, true) ?? "null").join(",")
    }]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record).sort().flatMap((key) => {
      const encoded = canonicalValue(record[key]);
      return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`];
    });
    return `{${fields.join(",")}}`;
  }
  return inArray ? "null" : undefined;
}

export function canonicalJson(value: unknown): string {
  return canonicalValue(value) ?? "null";
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashBubblePayload(record: BubbleRecord): Promise<string> {
  return sha256Hex(canonicalJson(record));
}

export function requireLegacyId(record: BubbleRecord): string {
  if (typeof record._id !== "string" || !record._id) {
    throw new Error("Bubble record is missing _id.");
  }
  return record._id;
}

export function partitionConflicts(
  records: BubbleRecord[],
  existingLegacyIds: ReadonlySet<string>,
): { conflicts: BubbleRecord[]; fresh: BubbleRecord[] } {
  const conflicts: BubbleRecord[] = [];
  const fresh: BubbleRecord[] = [];
  for (const record of records) {
    (existingLegacyIds.has(requireLegacyId(record)) ? conflicts : fresh).push(
      record,
    );
  }
  return { conflicts, fresh };
}

export function canAdvanceCheckpoint(
  completed: boolean,
  failed: boolean,
  resumable: boolean,
): boolean {
  return completed && !failed && !resumable;
}
