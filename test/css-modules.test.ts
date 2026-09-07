import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const entryPath = resolve(process.cwd(), "src/index.css");
const entry = readFileSync(entryPath, "utf8");
const globalStyleImports = [...entry.matchAll(/@import\s+["'](\.\/styles\/[^"']+\.css)["'];/g)]
  .map((match) => match[1]);

function findCssModules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findCssModules(path);
    return entry.name.endsWith(".module.css") ? [path] : [];
  });
}

describe("application CSS modules", () => {
  it("keeps index.css as an import-only entry point", () => {
    const withoutImports = entry.replace(/^\s*@import[^;]+;\s*$/gm, "").trim();

    expect(withoutImports).toBe("");
    expect(globalStyleImports.length).toBeGreaterThan(1);
  });

  it("keeps every imported global stylesheet present and below the legacy ceiling", () => {
    for (const stylePath of globalStyleImports) {
      const absolutePath = resolve(process.cwd(), "src", stylePath);
      const lineCount = readFileSync(absolutePath, "utf8").split(/\r?\n/).length;

      expect(statSync(absolutePath).isFile()).toBe(true);
      expect(lineCount).toBeLessThan(5_000);
    }
  });

  it("does not keep unreferenced legacy stylesheets beside the active globals", () => {
    const importedNames = new Set(globalStyleImports.map((path) => path.replace("./styles/", "")));
    const globalFiles = readdirSync(resolve(process.cwd(), "src/styles"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
      .map((entry) => entry.name);

    expect(globalFiles.filter((name) => !importedNames.has(name))).toEqual([]);
  });

  it("keeps component CSS modules small enough to remain locally understandable", () => {
    const modules = findCssModules(resolve(process.cwd(), "src"));

    expect(modules.length).toBeGreaterThan(0);
    for (const modulePath of modules) {
      const lineCount = readFileSync(modulePath, "utf8").split(/\r?\n/).length;
      expect(lineCount).toBeLessThan(600);
    }
  });

  it("does not move ShopOrderRecordsPage styles back into the override layer", () => {
    const overrides = readFileSync(resolve(process.cwd(), "src/styles/14-layout-overrides.css"), "utf8");

    expect(overrides).not.toContain(".shop-order-record-card");
    expect(overrides).not.toContain(".shop-order-edit-form");
  });
});
