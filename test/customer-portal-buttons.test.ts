import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/components/customer-portal/customer-buttons.css"), "utf8");

describe("customer portal action buttons", () => {
  it("keeps the filled green style off disabled buttons", () => {
    const start = css.indexOf(".customer-portal.customer-portal .ui-button");
    const enabledBlock = css.slice(start, css.indexOf("{", start));

    expect(enabledBlock).toContain(':not([data-size="icon"]):not(:disabled)');
    expect(enabledBlock.match(/:not\(:disabled\)/g)).toHaveLength(enabledBlock.split("\n").length);
  });

  it("defines a grey disabled style", () => {
    expect(css).toContain(".customer-portal.customer-portal :is(.ui-button,");
    expect(css).toContain("background:var(--customer-button-disabled)");
  });
});
