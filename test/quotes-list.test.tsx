import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuotesListPage } from "@/components/QuotesListPage";
import i18n from "@/i18n";
import type { QuoteListResult } from "@/lib/quotes";

const quoteResult: QuoteListResult = {
  total: 1,
  items: [
    {
      id: "quote-1",
      orderNumber: "Q-260812-001",
      customerName: "陳小姐",
      companyName: "示例企業",
      quoteStatus: "跟進中",
      grandTotal: 12880,
      currency: "HKD",
      deliveryAt: "2026-08-18T04:00:00.000Z",
      updatedAt: "2026-08-12T01:00:00.000Z",
    },
  ],
};

describe("Catering quotes list", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders quote fields and links to the quote record", async () => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "到會報價" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Q-260812-001")).toHaveAttribute(
      "href",
      "/quotes/quote-1",
    );
    expect(screen.getByText("陳小姐")).toBeInTheDocument();
    expect(screen.getByText("示例企業")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("跟進中")).toBeInTheDocument();
    expect(screen.getByText("HK$12,880")).toBeInTheDocument();
  });

  it("submits a server-side search and resets to the first page", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadQuotes).toHaveBeenCalledTimes(1));
    await user.type(
      screen.getByPlaceholderText("搜尋報價編號、客戶或公司"),
      "陳小姐",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith({
        page: 1,
        search: "陳小姐",
        status: "",
      }),
    );
  });

  it("shows a clear migration state when the orders table is unavailable", async () => {
    const loadQuotes = vi.fn().mockRejectedValue({ code: "42P01" });

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("報價資料表尚未完成遷移"),
    ).toBeInTheDocument();
  });
});
