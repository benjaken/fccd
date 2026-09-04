import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const entryPath = resolve(process.cwd(), "src/index.css");
const entry = readFileSync(entryPath, "utf8");
const moduleImports = [...entry.matchAll(/@import\s+["'](\.\/styles\/[^"']+\.css)["'];/g)]
  .map((match) => match[1]);

describe("application CSS modules", () => {
  it("keeps index.css as an import-only entry point", () => {
    const withoutImports = entry.replace(/^\s*@import[^;]+;\s*$/gm, "").trim();

    expect(withoutImports).toBe("");
    expect(moduleImports.length).toBeGreaterThan(1);
  });

  it("keeps every imported module present and reasonably sized", () => {
    for (const modulePath of moduleImports) {
      const absolutePath = resolve(process.cwd(), "src", modulePath);
      const lineCount = readFileSync(absolutePath, "utf8").split(/\r?\n/).length;

      expect(statSync(absolutePath).isFile()).toBe(true);
      expect(lineCount).toBeLessThan(5_000);
    }
  });
});
