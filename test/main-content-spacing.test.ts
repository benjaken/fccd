import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readAppStyles();

describe("main content spacing", () => {
  it("uses compact vertical spacing while preserving desktop horizontal spacing", () => {
    expect(styles).toMatch(
      /\.main-content\s*\{[^}]*padding:\s*20px 28px;/s,
    );
    expect(styles).toMatch(
      /\.main-content:has\([^}]+\)\s*\{\s*height:\s*calc\(100dvh\s*-\s*var\(--topbar-height\)\s*-\s*var\(--workspace-height\)\);\s*min-height:\s*0;/s,
    );
    expect(styles).toMatch(
      />\s*\.page-transition\s*>\s*:is\([^}]+\.orders-page[^}]+\)\s*\{\s*height:\s*100%;\s*min-height:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.page-transition\s*>\s*:has\(>\s*\.page-heading\):not\(:has\(>\s*\.page-heading button\)\)[^{]+\{\s*gap:\s*0;\s*grid-template-rows:\s*minmax\(0,\s*1fr\);/s,
    );
  });
});
