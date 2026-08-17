import { render, screen } from "@testing-library/react";
import { Factory, Truck } from "lucide-react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  WorkspacePlaceholderPage,
  workspaceFromPath,
} from "@/App";
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
});
