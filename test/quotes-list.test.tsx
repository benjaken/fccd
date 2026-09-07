import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dictionaries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dictionaries")>();
  const values = ["Low Chance", "High Chance", "Done Deal", "Case Closed"];
  return {
    ...actual,
    useDictItems: () => ({
      items: values.map((value, index) => ({
        id: `quote-status-${index}`,
        dictTypeId: "quote_status",
        value,
        label: value,
        labelEn: null,
        description: "",
        metadata: {},
        sortOrder: index,
        isActive: true,
      })),
      loading: false,
      error: null,
      reload: vi.fn(),
    }),
  };
});

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
      address: "九龍尖沙咀梳士巴利道 18 號",
      deliveryTime: "10:00 - 11:00",
      shipOutTime: null,
      quantity: 6,
      quoteStatus: "跟進中",
      grandTotal: 12880,
      currency: "HKD",
      deliveryAt: "2026-08-17T16:00:00.000Z",
      createdAt: "2026-08-12T01:00:00.000Z",
    },
  ],
};

describe("Catering quotes list", () => {
  beforeEach(async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    await i18n.changeLanguage("zh-HK");
  });

  it("renders quote cards and appends the next server page on mobile", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    let notifyIntersection: IntersectionObserverCallback = () => undefined;
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserverMock {
        constructor(callback: IntersectionObserverCallback) {
          notifyIntersection = callback;
        }

        observe = observe;
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
        root = null;
        rootMargin = "0px";
        thresholds = [];
      },
    );
    const secondQuote = {
      ...quoteResult.items[0],
      id: "quote-2",
      orderNumber: "Q-260812-002",
      customerName: "Mobile customer 2",
    };
    const loadQuotes = vi.fn().mockImplementation(({ page }: { page: number }) =>
      Promise.resolve({
        items: page === 1 ? quoteResult.items : [secondQuote],
        total: 2,
      }),
    );

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} canManage />
      </MemoryRouter>,
    );

    const mobileList = await waitFor(() => {
      const node = document.querySelector<HTMLElement>(".quote-mobile-list");
      expect(node).toBeInTheDocument();
      return node!;
    });
    expect(within(mobileList).getByText("Q-260812-001")).toBeInTheDocument();
    expect(document.querySelector(".mobile-list-load-more button")).not.toBeInTheDocument();
    await waitFor(() => expect(observe).toHaveBeenCalledTimes(1));
    act(() => {
      notifyIntersection(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(await within(mobileList).findByText("Q-260812-002")).toBeInTheDocument();
    expect(within(mobileList).getAllByRole("listitem")).toHaveLength(2);
    expect(loadQuotes).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    vi.unstubAllGlobals();
  });

  it("renders quote fields and links to the quote record", async () => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} canManage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "所有報價" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Q-260812-001")).toHaveAttribute(
      "href",
      "/quotes/quote-1",
    );
    expect(screen.getByText("Q-260812-001")).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Q-260812-001")).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("陳小姐")).toBeInTheDocument();
    expect(screen.getByText("示例企業")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("跟進中")).toBeInTheDocument();
    expect(screen.getByText("HK$12,880")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Catering")).toBeInTheDocument();
    expect(screen.getByText("公司午餐到會")).toBeInTheDocument();
    expect(screen.getByText("62897758")).toBeInTheDocument();
    expect(screen.getByText("(送貨上門) 油尖旺")).toBeInTheDocument();
    expect(screen.getByText("九龍尖沙咀梳士巴利道 18 號")).toHaveAttribute(
      "title",
      "九龍尖沙咀梳士巴利道 18 號",
    );
    expect(screen.getByText("2026-08-18")).toBeInTheDocument();
    expect(screen.getByText("10:00 - 11:00")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "品牌",
      "創建日期",
      "報價單號",
      "客戶 / 地區 / 地址",
      "送貨日期 / 送貨時間",
      "數量",
      "報價單描述",
      "總額",
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
    await user.click(screen.getByRole("button", { name: "開啟篩選" }));
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

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "報價單號" }));
    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ orderNumberSort: "ascending" }),
      ),
    );
  });

  it("always offers every quote status including unset", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "開啟篩選" }));
    const statusFilter = screen.getByLabelText("報價狀態");
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

  it("shows every brand in the recent open quote list", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    const loadBrands = vi.fn().mockResolvedValue([
      { id: "brand-1", name: "Catering" },
      { id: "brand-3", name: "Kitchen" },
    ]);

    render(
      <MemoryRouter>
        <QuotesListPage
          preset="recent-open"
          loadQuotes={loadQuotes}
          loadBrands={loadBrands}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "開啟篩選" }));
    const brandFilter = screen.getByLabelText("品牌");
    expect(
      within(brandFilter).getByRole("option", { name: "Kitchen" }),
    ).toBeInTheDocument();
    expect(loadBrands).toHaveBeenCalledOnce();
  });

  it("provides PDF, edit, file, and copy actions", async () => {
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} canManage />
      </MemoryRouter>,
    );

    await screen.findByText("Q-260812-001");
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/quotes/quote-1/pdf");
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "查看" })).toHaveAttribute("href", "/quotes/quote-1");
    expect(screen.getByRole("link", { name: "查看" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "查看" })).toHaveAttribute("rel", "noopener noreferrer");
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
        address: null,
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
    const cells = within(row as HTMLTableRowElement).getAllByRole("cell");
    const customerCell = cells[3];
    expect(customerCell).not.toHaveTextContent("未設定");
    expect(customerCell).not.toHaveTextContent("送貨日期:");
    expect(customerCell).not.toHaveTextContent("送貨時間:");
    expect(customerCell).not.toHaveTextContent("數量:");
    expect(cells[4]?.textContent).toBe("");
    expect(cells[5]?.textContent).toBe("6");
  });

  it("edits and saves the quote description on blur", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);
    const saveDescription = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <QuotesListPage
          canManage
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

  it("keeps quote editing controls read-only without manage permission", async () => {
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

    await screen.findByText("Q-260812-001");
    const description = document.querySelector(
      ".quote-description-cell textarea",
    );
    expect(description).not.toBeNull();
    expect(description).toHaveAttribute("readonly");
    expect(document.querySelector('a[href="/quotes/quote-1/edit"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "查看" })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/quotes/new?copyFrom=quote-1"]')).toBeNull();
    expect(document.querySelector('a[href="/quotes/quote-1/pdf"]')).toBeNull();
    expect(saveDescription).not.toHaveBeenCalled();
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
    ["upcoming", "即將到期報價"],
    ["large", "大單 100K 投標"],
    ["recent-open", "30日以內報價"],
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

  it("switches the large and recent queues with single-select tabs", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter initialEntries={["/quotes?nav=catering.quotes"]}>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadQuotes).toHaveBeenCalled());
    const largeTab = screen.getByRole("button", { name: "大單 100K 投標" });
    await user.click(largeTab);
    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ preset: "large" }),
      ),
    );
    expect(largeTab).toHaveAttribute("aria-pressed", "true");

    await user.click(largeTab);
    await waitFor(() =>
      expect(loadQuotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ preset: "all" }),
      ),
    );
    expect(largeTab).toHaveAttribute("aria-pressed", "false");
  });

  it("opens quote filters in the same side panel used by orders", async () => {
    const user = userEvent.setup();
    const loadQuotes = vi.fn().mockResolvedValue(quoteResult);

    render(
      <MemoryRouter>
        <QuotesListPage loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "開啟篩選" }));
    expect(screen.getByRole("dialog", { name: "篩選" })).toBeInTheDocument();
  });

  it("badges EmailMeForm-synced inquiries in the recent quote list", async () => {
    const loadQuotes = vi.fn().mockResolvedValue({
      ...quoteResult,
      items: [{ ...quoteResult.items[0], sourceSystem: "emailmeform" }],
    });

    render(
      <MemoryRouter>
        <QuotesListPage preset="recent-open" loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("EmailMeForm")).toBeInTheDocument();
  });

  it("badges WhatsApp inquiries separately from EmailMeForm", async () => {
    const loadQuotes = vi.fn().mockResolvedValue({
      ...quoteResult,
      items: [{ ...quoteResult.items[0], sourceSystem: "whatsapp" }],
    });

    render(
      <MemoryRouter>
        <QuotesListPage preset="recent-open" loadQuotes={loadQuotes} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("WhatsApp")).toBeInTheDocument();
    expect(screen.queryByText("EmailMeForm")).not.toBeInTheDocument();
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
