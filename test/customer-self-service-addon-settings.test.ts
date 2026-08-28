import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { pageAccessKey } from "@/auth/use-page-access";
import { isOrderSettingsTab } from "@/components/OrderSettingsTabNav";

describe("customer self-service add-on settings navigation", () => {
  it("registers both order settings tabs and their dedicated permissions", () => {
    expect(isOrderSettingsTab("add-ons")).toBe(true);
    expect(isOrderSettingsTab("add-on-block-dates")).toBe(true);
    expect(pageAccessKey("/orders/settings/add-ons")).toBe("orders.settings.addons");
    expect(pageAccessKey("/orders/settings/add-on-block-dates")).toBe("orders.settings.addon_block_dates");
  });

  it("shows both settings pages in order navigation", () => {
    const nav = readFileSync(resolve(process.cwd(), "src/lib/nav.ts"), "utf8");
    expect(nav).toContain('to: "/orders/settings/add-ons"');
    expect(nav).toContain('to: "/orders/settings/add-on-block-dates"');
    expect(nav).toContain('permissionKey: "orders.settings.addons"');
    expect(nav).toContain('permissionKey: "orders.settings.addon_block_dates"');
  });
});

