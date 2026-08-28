import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { DataInputProgressPage } from "@/components/DataInputProgressPage";
import i18n from "@/i18n";

describe("DataInputProgressPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders all input areas as period-specific detail links", async () => {
    render(<MemoryRouter><DataInputProgressPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Data Input Progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monthly / Festival Cost Input" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bank Settlement Date Input" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monday Stocktake" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly Advertising Cost Input" })).toBeInTheDocument();

    await waitFor(() => {
      const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
      expect(hrefs.some((href) => href.startsWith("/finance/cost-input?tab=monthly-non-festival&month="))).toBe(true);
      expect(document.querySelector("button.data-input-progress-row")).toBeInTheDocument();
      expect(hrefs.some((href) => href.startsWith("/kitchen/packing-stocktakes?date="))).toBe(true);
      expect(hrefs.some((href) => href.startsWith("/finance/cost-input?tab=weekly-advertising&week="))).toBe(true);
    });
  });

  it("groups a stocktake under its week's Monday and opens its actual saved date", async () => {
    render(
      <MemoryRouter>
        <DataInputProgressPage loaders={{ summary: async () => [{
          source: "packing_stocktakes",
          periodStart: "2026-07-15",
          enteredCount: 45,
          requiredCount: 47,
        }] }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: /2026-07-13.*45 \/ 47.*entered/i }))
      .toHaveAttribute("href", "/kitchen/packing-stocktakes?date=2026-07-15");
  });

  it("uses natural-height single-column cards on mobile", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const mobileRules = [...css.matchAll(/@media \(max-width: 720px\) \{([\s\S]*?)\r?\n\}/g)]
      .map((match) => match[1] ?? "")
      .find((rules) => rules.includes(".data-input-progress-grid")) ?? "";

    expect(mobileRules).toMatch(
      /\.data-input-progress-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*flex:\s*0 0 auto;[\s\S]*height:\s*auto;/,
    );
    expect(mobileRules).toMatch(
      /\.data-input-progress-card\s*\{[\s\S]*height:\s*auto;[\s\S]*max-height:\s*none;/,
    );
  });
});
