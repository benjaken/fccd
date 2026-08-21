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
      brandName: "Catering",
      brandId: "brand-1",
      orderNumber: "Q-260812-001",
      customerName: "陳小姐",
      companyName: "示例企業",
      quoteDescription: "公司午餐到會",
      contactPhone: "62897758",
      shippingMethodName: "送貨上門",
      districtName: "油尖旺",
      deliveryTime: "10:00 - 11:00",
      shipOutTime: null,
      quantity: 6,
      quoteStatus: "跟進中",
      grandTotal: 12880,
      currency: "HKD",
      deliveryAt: "2026-08-18T04:00:00.000Z",
      createdAt: "2026-08-12T01:00:00.000Z",
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
    expect(within(screen.getByRole("table")).getByText("Catering")).toBeInTheDocument();
    expect(screen.getByText("公司午餐到會")).toBeInTheDocument();
    expect(screen.getByText("62897758")).toBeInTheDocument();
    expect(screen.getByText("(送貨上門) 油尖旺")).toBeInTheDocument();
    expect(screen.getByText("送貨日期: 2026-08-18")).toBeInTheDocument();
    expect(screen.getByText("送貨時間: 10:00 - 11:00")).toBeInTheDocument();
    expect(screen.getByText("數量: 6")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "品牌",
      "創建日期",
      "報價單號",
      "客戶",
      "報價單描述",
      "總額",
      "生成訂單",
      "報價狀態",
      "操作",
    ]);
  });

  it("sorts the list by creation date", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadQuotes).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "創建日期" }));

    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, createdSort: "ascending" }),
      ),
    );
    expect(screen.getByRole("columnheader", { name: "創建日期" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("filters by brand and sorts by quote number", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    const loadBrands = vi.fn().mockResolvedValue([
      { id: "brand-1", name: "Catering" },
      { id: "brand-2", name: "HK Party Food" },
    ]);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} loadBrands={loadBrands} />
      </MemoryRouter>,
    );

    await screen.findByText("Q-260812-001");
    expect(screen.getByLabelText("報價狀態").closest(".quotes-filter-group")).toBe(
      screen.getByLabelText("品牌").closest(".quotes-filter-group"),
    );
    expect(screen.getAllByRole("combobox").at(-1)).toBe(
      screen.getByLabelText("品牌"),
    );
    expect(
      within(screen.getByLabelText("品牌")).getByRole("option", {
        name: "HK Party Food",
      }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("品牌"), "brand-2");
    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ brandId: "brand-2", page: 1 }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "報價單號" }));
    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ orderNumberSort: "ascending" }),
      ),
    );
  });

  it("always offers every quote status including unset", async () => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    const statusFilter = await screen.findByLabelText("報價狀態");
    for (const status of [
      "Low Chance",
      "High Chance",
      "Done Deal",
      "Case Closed",
      "未設狀態",
    ]) {
      expect(
        within(statusFilter).getByRole("option", { name: status }),
      ).toBeInTheDocument();
    }
  });

  it("shows every brand in the pending quote list", async () => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    const loadBrands = vi.fn().mockResolvedValue([
      { id: "brand-1", name: "Catering" },
      { id: "brand-3", name: "Kitchen" },
    ]);

    render(
      <MemoryRouter>
        <QuotesListPage
          preset="pending"
          loadQuotes={loadQuotes}
          loadBrands={loadBrands}
        />
      </MemoryRouter>,
    );

    const brandFilter = await screen.findByLabelText("品牌");
    expect(
      within(brandFilter).getByRole("option", { name: "Kitchen" }),
    ).toBeInTheDocument();
    expect(loadBrands).toHaveBeenCalledOnce();
  });

  it("provides PDF, edit, file, and copy actions", async () => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await screen.findByText("Q-260812-001");
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/quotes/quote-1/pdf");
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "編輯" })).toHaveAttribute("href", "/quotes/quote-1/edit");
    expect(screen.getByRole("button", { name: "文件" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "複製" })).toHaveAttribute("href", "/quotes/new?copyFrom=quote-1");
  });

  it("does not show a convert-to-order button in the quote list", async () => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await screen.findByText("Q-260812-001");
    expect(screen.queryByRole("button", { name: "轉成訂單" })).not.toBeInTheDocument();
  });

  it("leaves missing customer details blank instead of showing not set", async () => {
    const loadQuotes = vi.fn().mockResolvedValue({
      ...quoteResult,
      items: [{
        ...quoteResult.items[0],
        customerName: null,
        companyName: null,
        contactPhone: null,
        shippingMethodName: null,
        districtName: null,
        deliveryAt: null,
        deliveryTime: null,
        shipOutTime: null,
      }],
    });

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await screen.findByText("Q-260812-001");
    const row = screen.getByText("Q-260812-001").closest("tr");
    expect(row).not.toBeNull();
    const customerCell = within(row as HTMLTableRowElement).getAllByRole("cell")[3];
    expect(customerCell).not.toHaveTextContent("未設定");
    expect(customerCell).toHaveTextContent("送貨日期:");
    expect(customerCell).toHaveTextContent("送貨時間:");
    expect(customerCell).toHaveTextContent("出車時間:");
  });

  it("edits and saves the quote description on blur", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    const saveDescription = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <QuotesListPage
          loadQuotes={loadQuotes}
          saveDescription={saveDescription}
        />
      </MemoryRouter>,
    );

    const description = await screen.findByRole("textbox", {
      name: "編輯報價單描述 Q-260812-001",
    });
    await user.clear(description);
    await user.type(description, "更新後的報價描述");
    await user.tab();

    await waitFor(() =>
      expect(saveDescription).toHaveBeenCalledWith(
        "quote-1",
        "更新後的報價描述",
      ),
    );
    expect(description).toHaveValue("更新後的報價描述");
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
        preset: "all",
      }),
    );
  });

  it.each([
      ["pending", "待確認報價單"],
    ["upcoming", "即將到期報價"],
  ] as const)("loads the %s quote queue with its title", async (preset, title) => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage preset={preset} loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(loadQuotes).toHaveBeenCalledWith(
      expect.objectContaining({ preset }),
    );
  });

  it("badges EmailMeForm-synced inquiries in the pending quote list", async () => {
    const loadQuotes = vi.fn().mockResolvedValue({
      ...quoteResult,
      items: [{ ...quoteResult.items[0], sourceSystem: "emailmeform" }],
    });

    render(
      <MemoryRouter>
        <QuotesListPage preset="pending" loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("EmailMeForm")).toBeInTheDocument();
  });

  it("paginates quotes in groups of fifteen", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue({ ...quoteResult, total: 31 });

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("spinbutton", { name: "跳至頁碼" }),
    ).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "下一頁" }));

    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
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
