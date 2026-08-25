import { render, screen } from "@testing-library/react";
import { Factory, Truck } from "lucide-react";
import { beforeEach, describe, expect, it } from "vitest";

import { WorkspacePlaceholderPage } from "@/App";
import {
  firstAccessibleNavigationPath,
  isWorkspaceNavActive,
  workspaceLinks,
  workspaceFromPath,
} from "@/lib/nav";
import i18n from "@/i18n";

describe("Workspace switcher", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("maps factory and driver landings, and treats ops routes as factory", () => {
    expect(workspaceFromPath("/factory")).toBe("factory");
    expect(workspaceFromPath("/driver-delivery")).toBe("delivery");
    expect(workspaceFromPath("/customer")).toBe("customer");
    expect(workspaceFromPath("/")).toBe("factory");
    expect(workspaceFromPath("/orders")).toBe("factory");
    expect(workspaceFromPath("/delivery")).toBe("factory");
    expect(workspaceFromPath("/restaurant")).toBe("factory");
  });

  it("never marks 工場版面 as the active workspace link", () => {
    expect(isWorkspaceNavActive("factory", "/factory")).toBe(false);
    expect(isWorkspaceNavActive("factory", "/")).toBe(false);
    expect(isWorkspaceNavActive("factory", "/orders")).toBe(false);
    expect(isWorkspaceNavActive("delivery", "/driver-delivery")).toBe(true);
    expect(isWorkspaceNavActive("delivery", "/factory")).toBe(false);
  });

  it("shows factory and driver placeholder copy", () => {
    const { rerender } = render(
      <WorkspacePlaceholderPage workspaceKey="factory" icon={Factory} />,
    );

    expect(
      screen.getByRole("heading", { name: "工場版面" }),
    ).toBeInTheDocument();
    expect(screen.getByText("內容稍後補上。")).toBeInTheDocument();

    rerender(
      <WorkspacePlaceholderPage workspaceKey="delivery" icon={Truck} />,
    );

    expect(
      screen.getByRole("heading", { name: "司機送貨" }),
    ).toBeInTheDocument();
  });

  it("keeps customer self-service as a disabled workspace label", () => {
    expect(i18n.t("workspace.factory")).toBe("工場版面");
    expect(i18n.t("workspace.delivery")).toBe("司機送貨");
    expect(i18n.t("workspace.customer")).toBe("客戶自助");
    expect(i18n.exists("workspace.catering")).toBe(false);
    expect(i18n.exists("workspace.restaurant")).toBe(false);
  });

  it("registers a separate permission for every workspace entry", () => {
    expect(
      workspaceLinks.map((item) => [item.key, item.permissionKey]),
    ).toEqual([
      ["factory", "workspace.factory"],
      ["delivery", "workspace.delivery"],
      ["customer", "workspace.customer"],
    ]);
  });

  it("redirects a role without home access to its first permitted menu", () => {
    const allowed = new Set(["orders.pending"]);
    const canAccess = (key: string) => allowed.has(key);
    const canAccessSection = (_key: string, children: string[] = []) =>
      children.some(canAccess);

    expect(
      firstAccessibleNavigationPath(canAccess, canAccessSection),
    ).toBe("/orders/pending");
  });

  it("falls back to an authorized workspace and returns null with no grants", () => {
    const noSectionAccess = () => false;

    expect(
      firstAccessibleNavigationPath(
        (key) => key === "workspace.factory",
        noSectionAccess,
      ),
    ).toBe("/factory");
    expect(
      firstAccessibleNavigationPath(() => false, noSectionAccess),
    ).toBeNull();
    expect(
      firstAccessibleNavigationPath(
        (key) => key === "workspace.customer",
        noSectionAccess,
      ),
    ).toBeNull();
  });
});
