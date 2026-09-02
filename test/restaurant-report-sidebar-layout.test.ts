import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("restaurant report sidebar layout", () => {
  it("places all five restaurant report filters in a compact desktop sidebar", () => {
    const styles = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");

    expect(styles).toMatch(/@media \(min-width: 1101px\)[\s\S]*\.restaurant-sales-page\.is-embedded,[\s\S]*\.shop-sales-hours-report,[\s\S]*\.restaurant-sales-salary-report,[\s\S]*\.restaurant-sales-cost-report,[\s\S]*\.restaurant-pnl-report\s*\{[^}]*grid-template-columns:\s*minmax\(240px,\s*280px\)\s+minmax\(0,\s*1fr\);/);
    expect(styles).toMatch(/\.restaurant-sales-page\.is-embedded > \.restaurant-sales-filters,[\s\S]*\.shop-sales-hours-report > \.shop-sales-hours-filters,[\s\S]*\.restaurant-sales-salary-report > \.restaurant-sales-salary-filters,[\s\S]*\.restaurant-sales-cost-report > \.restaurant-pnl-filters,[\s\S]*\.restaurant-pnl-report > \.restaurant-pnl-filters\s*\{[^}]*grid-column:\s*1;[^}]*flex-direction:\s*column;/);
    expect(styles).toMatch(/\.restaurant-sales-page\.is-embedded > :not\(\.restaurant-sales-filters\),[\s\S]*\.restaurant-pnl-report > :not\(\.restaurant-pnl-filters\)\s*\{[^}]*grid-column:\s*2;/);
  });
});
