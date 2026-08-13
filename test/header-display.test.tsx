import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { CurrentDateTime } from "@/App";
import i18n from "@/i18n";

describe("Header display requirements", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows the Hong Kong date and time", () => {
    render(
      <CurrentDateTime
        initialNow={new Date("2026-08-11T13:05:09.000Z")}
        live={false}
      />,
    );

    expect(screen.getByText(/8月11日/)).toBeInTheDocument();
    expect(screen.getByText("21:05:09")).toBeInTheDocument();
  });

  it("keeps every explicit pixel font size at 14px or larger", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const sizes = [...stylesheet.matchAll(/font-size:\s*(\d+)px/g)].map(
      (match) => Number(match[1]),
    );

    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  });

  it("right-aligns workspace soft links in the top header", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const workspaceRule = stylesheet.match(/\.workspace-links\s*\{([^}]+)\}/);

    expect(workspaceRule?.[1]).toContain("justify-content: flex-end");
  });

  it("does not render or style a global topbar search", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );

    expect(appSource).not.toContain('className="search-box"');
    expect(stylesheet).not.toContain(".search-box");
  });
});
