import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/components/customer-portal/customer-personal.css", "utf8");
describe("personal portal fixed navigation", () => {
  it("anchors navigation to the viewport with the same centered width as the workspace", () => {
    const header = css.match(/\.customer-portal\.personal-workspace \.portal-workspace-header\{([^}]+)\}/)?.[1];
    expect(header).toContain("position:fixed");
    expect(header).toContain("top:0");
    expect(header).toContain("width:100%");
    expect(header).toContain("max-width:820px");
  });
  it("reserves navigation and safe-area space on mobile and desktop", () => {
    expect(css).toContain("--personal-navbar-height:64px");
    expect(css).toContain("--personal-navbar-height:76px");
    const workspaces = [...css.matchAll(/\.customer-portal\.personal-workspace\{([^}]+)\}/g)];
    for (const [, rule] of workspaces.filter(([, rule]) => rule.includes("padding:"))) {
      expect(rule).toContain("padding:calc(var(--personal-navbar-height) + env(safe-area-inset-top)) 0 0");
    }
  });
});
