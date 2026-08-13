import { describe, expect, it } from "vitest";

import { isPrimaryNavActive, sectionFromPath } from "@/App";

describe("Primary navigation section matching", () => {
  it("maps settings child routes to the settings section", () => {
    expect(sectionFromPath("/settings")).toBe("settings");
    expect(sectionFromPath("/settings/users")).toBe("settings");
    expect(sectionFromPath("/settings/roles")).toBe("settings");
    expect(sectionFromPath("/settings/login-logs")).toBe("settings");
    expect(sectionFromPath("/settings/attachments")).toBe("settings");
  });

  it("keeps the settings top-nav active on child pages", () => {
    expect(isPrimaryNavActive("settings", "settings", false)).toBe(true);
    expect(isPrimaryNavActive("settings", "orders", false)).toBe(false);
    expect(isPrimaryNavActive("orders", "orders", false)).toBe(true);
    expect(isPrimaryNavActive("overview", "overview", true)).toBe(true);
  });
});
