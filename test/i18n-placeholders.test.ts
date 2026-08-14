import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import i18n from "@/i18n";

const PLACEHOLDER_T_KEY =
  /placeholder\s*=\s*\{\s*t\(\s*["']([^"']+)["']/g;
const HARD_CODED_PLACEHOLDER = /placeholder\s*=\s*["'`][^"'`]+["'`]/;
const PASS_THROUGH_PLACEHOLDER =
  /placeholder\s*=\s*\{\s*(placeholder|selected\.length === 0 \? placeholder : "")\s*\}/;

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

function isZhHkPlaceholderAllowed(value: string): boolean {
  const trimmed = value.trim();
  if (/[\u3400-\u9fff]/.test(trimmed)) return true;
  if (/@/.test(trimmed)) return true;
  if (/^\+?[\d\s\-().]+$/.test(trimmed)) return true;
  if (/^\$?[\d.]+$/.test(trimmed)) return true;
  return false;
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
    const english = collectPlaceholders(bundle).filter(
      (entry) => !isZhHkPlaceholderAllowed(entry.value),
    );
    expect(english).toEqual([]);
  });

  it("does not hard-code placeholder strings in source", () => {
    const root = path.resolve(process.cwd(), "src");
    const files = listSourceFiles(root).filter(
      (file) => !file.endsWith(`${path.sep}i18n.ts`),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, path.relative(process.cwd(), file)).not.toMatch(
        HARD_CODED_PLACEHOLDER,
      );
    }
  });

  it("uses dedicated *Placeholder i18n keys for input placeholders", () => {
    const root = path.resolve(process.cwd(), "src");
    const files = listSourceFiles(root).filter(
      (file) => !file.endsWith(`${path.sep}i18n.ts`),
    );
    const invalid: Array<{ file: string; key: string }> = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const relative = path.relative(process.cwd(), file);
      for (const match of source.matchAll(PLACEHOLDER_T_KEY)) {
        const key = match[1];
        if (!/placeholder$/i.test(key)) {
          invalid.push({ file: relative, key });
        }
      }

      const leftover = source.replace(PLACEHOLDER_T_KEY, "").replace(
        new RegExp(PASS_THROUGH_PLACEHOLDER.source, "g"),
        "",
      );
      expect(leftover, relative).not.toMatch(/placeholder\s*=\s*\{/);
    }

    expect(invalid).toEqual([]);
  });
});
