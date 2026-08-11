import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { Dashboard } from "@/App";
import i18n from "@/i18n";

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
      <CurrentLocation />
    </MemoryRouter>,
  );
}

describe("Dashboard navigation", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it.each([
    ["今日訂單", "/orders"],
    ["今日營業額", "/reports?view=revenue"],
    ["待配送", "/delivery"],
    ["低庫存項目", "/inventory/low-stock"],
    ["高機會報價", "/quotes/high-chance"],
    ["大單報價", "/quotes/large"],
    ["未付款訂單", "/orders/unpaid"],
    ["未安排司機", "/delivery/unassigned"],
    ["已送貨未付款", "/orders/delivered-unpaid"],
  ])("links %s to %s", (name, target) => {
    renderDashboard();

    expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveAttribute(
      "href",
      target,
    );
  });

  it("opens the selected order detail page", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      screen.getByRole("link", { name: "FC-260811-018" }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/orders/FC-260811-018",
    );
  });

  it("opens the selected order status view", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      screen.getByRole("link", { name: /已確認 18/ }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/orders?status=confirmed",
    );
  });
});
