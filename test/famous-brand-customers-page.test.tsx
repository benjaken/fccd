import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { FamousBrandCustomersPage } from "@/components/FamousBrandCustomersPage";
import i18n from "@/i18n";
import type { FamousBrandCustomer } from "@/lib/famous-brand-customers";

function customer(
  key: string,
  name: string,
  count: number,
  updatedAt: string,
): FamousBrandCustomer {
  return {
    key,
    brandName: name,
    quoteCount: count,
    openQuoteCount: count,
    doneDealCount: 0,
    totalAmount: count * 100,
    currency: "HKD",
    latestQuoteId: `${key}-1`,
    latestQuoteNumber: `Q-${key}-1`,
    latestDealAt: updatedAt,
    orders: Array.from({ length: count }, (_, index) => ({
      id: `${key}-${index + 1}`,
      orderNumber: `Q-${key}-${index + 1}`,
      status: "50%",
      amount: 100,
      currency: "HKD",
      updatedAt,
    })),
  };
}

describe("Famous brand customers page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("sorts customers by order count, selects the largest, and switches order details", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FamousBrandCustomersPage
          loadCustomers={async () => [
            customer("small", "Small Customer", 1, "2026-09-01T08:00:00Z"),
            customer("large", "Large Customer", 3, "2026-08-20T08:00:00Z"),
          ]}
        />
      </MemoryRouter>,
    );

    const customerList = await screen.findByRole("complementary", { name: "客戶列表" });
    const customerButtons = within(customerList).getAllByRole("button");
    expect(customerButtons[0]).toHaveTextContent("Large Customer");
    expect(customerButtons[0]).toHaveTextContent("3");
    expect(customerButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Q-large-3" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Q-small-1" })).not.toBeInTheDocument();

    await user.click(within(customerList).getByRole("button", { name: /Small Customer/ }));

    expect(screen.getByRole("link", { name: "Q-small-1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Q-large-1" })).not.toBeInTheDocument();
  });
});
