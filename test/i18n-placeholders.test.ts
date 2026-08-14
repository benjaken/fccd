import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import i18n from "@/i18n";

const ENGLISH_PLACEHOLDER =
  /^(Choose |Select |Enter |Product |Add |Search |Remark)|^(Unit|kg|Remarks?)$|Choose some options/i;

function collectPlaceholders(
  value: unknown,
  pathParts: string[] = [],
): Array<{ path: string; value: string }> {
  if (typeof value === "string") {
    const key = pathParts[pathParts.length - 1] ?? "";
    if (/placeholder$/i.test(key)) {
      return [{ path: pathParts.join("."), value }];
    }
    return [];
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectPlaceholders(child, [...pathParts, key]),
  );
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("i18n placeholders", () => {
  it("keeps zh-HK placeholders in Chinese instead of English Bubble copy", () => {
    const bundle = i18n.getResourceBundle("zh-HK", "translation");
    const english = collectPlaceholders(bundle).filter((entry) =>
      ENGLISH_PLACEHOLDER.test(entry.value.trim()),
    );
    expect(english).toEqual([]);
  });

  it("does not hard-code placeholder strings in React components", () => {
    const root = path.resolve(process.cwd(), "src/components");
    const files = listSourceFiles(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, path.relative(process.cwd(), file)).not.toMatch(
        /placeholder\s*=\s*["'][^"']+["']/,
      );
    }
  });
});
