import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared order-style list layout", () => {
  it("keeps three-section panel pagination out of the flexible content row", () => {
    const css = readAppStyles();

    expect(css).toMatch(
      /\.orders-panel\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s,
    );
    expect(css).toMatch(
      /\.orders-panel:has\(> :nth-child\(4\)\)\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/s,
    );
  });
});
