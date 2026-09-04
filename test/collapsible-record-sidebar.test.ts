import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("collapsible record sidebar", () => {
  it("animates app and record sidebars when they hide and open", () => {
    const styles = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");

    expect(styles).toMatch(/--sidebar-motion-duration:\s*280ms;/);
    expect(styles).toMatch(/\.sidebar\s*\{[^}]*transition:\s*width var\(--sidebar-motion-duration\)/s);
    expect(styles).toMatch(/\.shell-body\s*\{[^}]*transition:\s*grid-template-columns var\(--sidebar-motion-duration\)/s);
    expect(styles).toMatch(/\.monthly-expenses-history,[\s\S]*\.stocktake-date-list,\s*\.seasoning-recipes-sidebar\s*\{[^}]*transition:[\s\S]*width var\(--sidebar-motion-duration\)/);
    expect(styles).toMatch(/\.record-sidebar-slot\.is-collapsed > aside\s*\{[^}]*width:\s*0;/);
  });
});
