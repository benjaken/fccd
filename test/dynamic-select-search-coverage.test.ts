import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const allowedShortOrSystemLists = /(?:STATUS_OPTIONS|KITCHEN_STATUS_FILTERS|DIRECTION_FILTERS|WORKLOAD_OPTIONS|LOGIN_LOG_EVENT_TYPES|SYSTEM_ROLES|ATTACHMENT_FILE_TYPES|availableStatuses|qz\.printers)/;

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "ui" ? [] : filesIn(file);
    return entry.name.endsWith(".tsx") ? [file] : [];
  });
}

describe("dynamic select search coverage", () => {
  it("keeps data-driven or long option lists out of unfiltered native selects", () => {
    const misses = filesIn(path.resolve(process.cwd(), "src/components")).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/<select\b[\s\S]*?<\/select>/g)].flatMap((match) => {
        const block = match[0];
        if (!block.includes(".map(") || allowedShortOrSystemLists.test(block)) return [];
        return [`${path.relative(process.cwd(), file)}:${source.slice(0, match.index).split("\n").length}`];
      });
    });

    expect(misses).toEqual([]);
  });
});
