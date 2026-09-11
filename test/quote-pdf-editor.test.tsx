import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const dictionaryValues = vi.hoisted(() => ({
  quote_term_template: ["以上訂單附送 54 份餐具，包括即棄餐具、紙碗及一些食物夾。"],
  quote_payment_template: ["銀行轉帳：匯豐銀行 HSBC：747-221000-838（戶口名稱：Food Channels Ltd.）", "轉數快：轉數快識別碼 FPS ID: 102938271（Food Channels Ltd.）"],
  quote_additional_info: ["每個便當包括一份餐具"],
  quote_activity: ["10月15日 120個飯盒"],
}));

vi.mock("@/lib/dictionaries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dictionaries")>();
  return {
    ...actual,
    useDictItems: (typeCode: string) => ({
      items: (dictionaryValues[typeCode as keyof typeof dictionaryValues] ?? []).map((value, index) => ({
        id: `${typeCode}-${index}`,
        dictTypeId: typeCode,
        value,
        label: value,
        labelEn: null,
        description: "",
        metadata: typeCode === "quote_activity" ? { amount: "5400" } : {},
        sortOrder: index,
        isActive: true,
      })),
      loading: false,
      error: null,
      reload: vi.fn(),
    }),
  };
});

import { QuotePdfEditorPage } from "@/components/QuotePdfEditorPage";
import type { OrderDetailResult } from "@/lib/order-details";

const result: OrderDetailResult = {
  order: {
    id: "quote-1",
    documentType: "quote",
    channelEmail: "quotes@foodchannels-catering.com",
    orderNumber: "FCCQ20260828",
    customerName: "程嘉敏",
    companyName: "STFA Seaward Woo College",
    email: "customer@example.com",
    contactA: "94808987",
    contactB: null,
    address: "灣仔杜老誌道20號",
    customerNote: null,
    quoteStatus: "High Chance",
    quoteDescription: null,
    deliveryTerms: null,
    deliveryAt: "2026-10-15T03:00:00.000Z",
    deliveryTime: "12:00 - 12:30",
    shipOutTime: "11:00 - 12:00",
    deliveryStatus: null,
    isSentToFactory: false,
    factoryDate: null,
    factoryPackingNote: null,
    currency: "HKD",
    discount: 0,
    shippingFee: 0,
    grandTotal: 5400,
    outstanding: 5400,
    updatedAt: "2026-08-19T02:00:00.000Z",
    statuses: [],
  },
  lines: [{
    id: "line-1",
    sku: "BENTO-01",
    productName: "雙拼飯盒",
    content: null,
    quantity: 120,
    unitPrice: 45,
    totalPrice: 5400,
    isAddon: false,
    remarks: null,
  }],
  deliveries: [],
  payments: [],
  timeline: [],
  terms: ["報價有效期為14天"],
  paymentMethods: ["銀行轉帳"],
  quoteFiles: [],
};

const configuredShippingFees = [
  { id: "fee-1", item: "運費－新界區－地面交收", fee: 100, createdAt: "2026-08-01T00:00:00.000Z" },
];

const lunchBoxResult: OrderDetailResult = {
  ...result,
  order: result.order ? { ...result.order, channelName: "Catering", orderNumber: "FCBQ20260828" } : null,
};

const partyFoodResult: OrderDetailResult = {
  ...result,
  order: result.order ? { ...result.order, channelName: "Party Food", orderNumber: "FCPQ20260828" } : null,
};

function renderPage(
  loadDetail = vi.fn().mockResolvedValue(result),
  loadShippingFees = vi.fn().mockResolvedValue(configuredShippingFees),
  loadPdfPages = vi.fn().mockResolvedValue([]),
) {
  render(
    <MemoryRouter initialEntries={["/quotes/quote-1/pdf"]}>
      <Routes>
        <Route path="/quotes/:id/pdf" element={<QuotePdfEditorPage loadDetail={loadDetail} loadShippingFees={loadShippingFees} loadPdfPages={loadPdfPages} />} />
      </Routes>
    </MemoryRouter>,
  );
  return loadDetail;
}

function measuredProductRowRect(element: HTMLElement) {
  const lineIndex = Number(element.dataset.pdfAutoProductIndex);
  const page = element.closest<HTMLElement>(".quote-pdf-sheet");
  if (!page || !Number.isInteger(lineIndex)) return null;

  const pages = Array.from(document.querySelectorAll<HTMLElement>(".quote-pdf-sheet"));
  const pageIndex = pages.indexOf(page);
  const rows = Array.from(page.querySelectorAll<HTMLElement>("[data-pdf-auto-product-index]"));
  const position = rows.indexOf(element);
  const top = (pageIndex === 0 ? 300 : 100) + position * 48;
  const height = 48;
  return { x: 0, y: top, top, right: 800, bottom: top + height, left: 0, width: 800, height, toJSON: () => ({}) } as DOMRect;
}

describe("editable quote PDF page", () => {
  it("excludes voided products from the quotation PDF", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      lines: [
        ...result.lines,
        {
          ...result.lines[0],
          id: "voided-line",
          productName: "Cancelled product must not print",
          quantity: 1,
          unitPrice: 0,
          totalPrice: 0,
          isVoid: true,
        },
      ],
    }));

    expect(await screen.findByDisplayValue("雙拼飯盒")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Cancelled product must not print")).not.toBeInTheDocument();
  });

  it("hides a product subtotal when its quantity is zero", async () => {
    const zeroQuantityResult: OrderDetailResult = {
      ...result,
      lines: result.lines.map((line) => ({
        ...line,
        quantity: 0,
        totalPrice: 0,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(zeroQuantityResult));

    const quantity = await screen.findByLabelText("數量 1");
    expect(quantity).toHaveValue("");
    const row = quantity.closest("tr");
    expect(row).not.toBeNull();
    expect(row?.querySelector("td:last-child")).toBeEmptyDOMElement();
    expect(document.querySelector(".quote-pdf-table")).toHaveClass("has-no-quantities");
    expect(screen.getByRole("columnheader", { name: "數量" })).toHaveClass("quote-pdf-edit-only");
    expect(screen.getByRole("columnheader", { name: "金額" })).toHaveClass("quote-pdf-edit-only");
    expect(screen.getByRole("columnheader", { name: "單價" })).toBeInTheDocument();
    expect(screen.getByLabelText("單價 1").previousElementSibling).toHaveTextContent("$");
    expect(screen.queryByText("小計：")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("運費")).not.toBeInTheDocument();
    expect(screen.queryByText("總數：")).not.toBeInTheDocument();
  });

  it("hides quantity columns from generated output when quantity was never entered", async () => {
    const emptyQuantityResult: OrderDetailResult = {
      ...result,
      lines: result.lines.map((line) => ({
        ...line,
        quantity: null,
        totalPrice: null,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(emptyQuantityResult));

    const unitPrice = await screen.findByLabelText("單價 1");
    expect(unitPrice).toHaveValue("45");
    expect(unitPrice.previousElementSibling).toHaveClass("quote-pdf-price-prefix");
    expect(unitPrice.previousElementSibling).toHaveTextContent("$");
    expect(document.querySelector(".quote-pdf-table")).toHaveClass("has-no-quantities");
    expect(screen.getByRole("columnheader", { name: "數量" })).toHaveClass("quote-pdf-edit-only");
    expect(screen.getByRole("columnheader", { name: "金額" })).toHaveClass("quote-pdf-edit-only");
    expect(screen.getByRole("columnheader", { name: "單價" })).toBeInTheDocument();
    expect(screen.getByLabelText("數量 1")).toHaveValue("");
  });

  it("hides the dollar prefix when the unit price is cleared", async () => {
    const user = userEvent.setup();
    renderPage();

    const unitPrice = await screen.findByLabelText("單價 1");
    expect(unitPrice.previousElementSibling).toHaveTextContent("$");
    await user.clear(unitPrice);
    expect(unitPrice).toHaveValue("");
    expect(unitPrice.previousElementSibling).toBeNull();
    await user.tab();
    expect(unitPrice).toHaveValue("");
    expect(unitPrice.previousElementSibling).toBeNull();
    await user.type(unitPrice, "$88");
    expect(unitPrice.previousElementSibling).toHaveTextContent("$");
    await user.tab();
    expect(unitPrice).toHaveValue("88");
    expect(unitPrice.previousElementSibling).toHaveTextContent("$");
  });

  it("shows the product subtotal again when quantity becomes greater than zero", async () => {
    const user = userEvent.setup();
    const zeroQuantityResult: OrderDetailResult = {
      ...result,
      lines: result.lines.map((line) => ({
        ...line,
        quantity: 0,
        totalPrice: 0,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(zeroQuantityResult));

    const quantity = await screen.findByLabelText("數量 1");
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.tab();

    const row = quantity.closest("tr");
    await waitFor(() => {
      expect(row?.querySelector("td:last-child")).toHaveTextContent("$90");
    });
  });

  it("uses the delivery time instead of the ship-out time", async () => {
    renderPage();

    await waitFor(() => expect(document.querySelector("#quote-delivery-time")).toHaveValue("12:00 - 12:30"));
  });

  it("keeps a single-line delivery address at one textarea row", async () => {
    renderPage();

    await waitFor(() => {
      const address = document.querySelector("#quote-address");
      expect(address).toHaveAttribute("rows", "1");
      expect(address?.parentElement).toHaveClass("quote-pdf-address-control");
      expect(address?.parentElement?.parentElement).toHaveClass("quote-pdf-meta-grid");
    });
  });

  it("inserts all active brand pages before and after the generated quote", async () => {
    const brandedResult: OrderDetailResult = {
      ...result,
      order: result.order ? { ...result.order, channelId: "brand-1" } : null,
    };
    const loadPdfPages = vi.fn().mockResolvedValue([
      { id: "front-1", channelId: "brand-1", channelName: "Catering", placement: "front", title: "封面一", objectPath: "front.png", originalFilename: "front.png", mimeType: "image/png", sizeBytes: 1, sortOrder: 1, isActive: true, previewUrl: "https://example.com/front.png", updatedAt: "2026-08-21T00:00:00Z" },
      { id: "back-1", channelId: "brand-1", channelName: "Catering", placement: "back", title: "封底一", objectPath: "back.png", originalFilename: "back.png", mimeType: "image/png", sizeBytes: 1, sortOrder: 1, isActive: true, previewUrl: "https://example.com/back.png", updatedAt: "2026-08-21T00:00:00Z" },
    ]);

    renderPage(vi.fn().mockResolvedValue(brandedResult), undefined, loadPdfPages);

    await screen.findByRole("heading", { name: "到會套餐報價" });
    const front = document.querySelector(".quote-pdf-front-page");
    const quote = document.querySelector(".quote-pdf-sheet");
    const back = document.querySelector(".quote-pdf-back-page");
    expect(loadPdfPages).toHaveBeenCalledWith("brand-1");
    expect(front).not.toBeNull();
    expect(back).not.toBeNull();
    expect(front?.compareDocumentPosition(quote as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quote?.compareDocumentPosition(back as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector(".quote-pdf-editor")).toHaveClass("has-back-pages");
  });

  it("keeps the quote printable when configured brand pages cannot be loaded", async () => {
    const brandedResult: OrderDetailResult = {
      ...result,
      order: result.order ? { ...result.order, channelId: "brand-1" } : null,
    };
    renderPage(
      vi.fn().mockResolvedValue(brandedResult),
      undefined,
      vi.fn().mockRejectedValue(new Error("table unavailable")),
    );

    expect(await screen.findByRole("heading", { name: "到會套餐報價" })).toBeInTheDocument();
    expect(screen.getByText("封面封底暫時無法載入，將只列印報價內容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確定並列印 PDF" })).toBeEnabled();
  });

  it("refreshes source fields while retaining PDF-only content from a legacy draft", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      quoteNumber: "OLD-QUOTE",
      customerName: "舊草稿客戶",
      deliveryAddress: "舊地址",
      terms: ["PDF 專用條款"],
    }));

    renderPage();

    expect(await screen.findByRole("heading", { name: "到會套餐報價" })).toBeInTheDocument();
    expect(screen.getByLabelText("產品 1")).toHaveValue("雙拼飯盒");
    expect(screen.getByLabelText("報價單號")).toHaveValue("FCCQ20260828");
    expect(screen.getByLabelText("客戶名稱")).toHaveValue("程嘉敏");
    expect(screen.getByLabelText("送貨地址")).toHaveValue("灣仔杜老誌道20號");
    expect(screen.getByLabelText("條款及細則 1")).toHaveValue("PDF 專用條款");
  });

  it("uses quote product lines when a local draft only has empty placeholder rows", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      lines: [{ id: "placeholder", description: "", quantity: "1", unitPrice: "0" }],
    }));

    renderPage();

    expect(await screen.findByLabelText("產品 1")).toHaveValue("雙拼飯盒");
  });

  it("refreshes product data instead of restoring a stale local PDF copy", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      lines: [{ id: "line-1", description: "自訂雙拼", quantity: "120", unitPrice: "45" }],
    }));

    renderPage();

    expect(await screen.findByLabelText("產品 1")).toHaveValue("雙拼飯盒");
  });

  it("refreshes every financial adjustment from the latest quote", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      discount: "999",
      cashDollarDeduction: "999",
      cashDollarPurchase: "999",
    }));
    const latestResult: OrderDetailResult = {
      ...lunchBoxResult,
      order: lunchBoxResult.order ? {
        ...lunchBoxResult.order,
        discount: 100,
        cashdollarRedeemed: 50,
        cashdollarPurchased: 10,
      } : null,
    };

    renderPage(vi.fn().mockResolvedValue(latestResult));

    await screen.findByRole("heading", { name: "便當報價" });
    expect(screen.getByLabelText("活動折扣")).toHaveValue("100");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$5,260")).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}");
      expect(saved.discount).toBe("100");
      expect(saved.cashDollarDeduction).toBe("50");
      expect(saved.cashDollarPurchase).toBe("10");
    });
  });

  it("repairs zero totals saved by legacy PDF drafts", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      lines: [{ id: "line-1", description: "自訂雙拼", quantity: "120", unitPrice: "0" }],
    }));

    renderPage();

    expect(await screen.findByLabelText("單價 1")).toHaveValue("45");
    expect(screen.getAllByText("$5,400").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("產品 1")).toHaveValue("雙拼飯盒");
  });

  it("derives a missing unit price from the saved line total", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      lines: [{ ...result.lines[0], unitPrice: null, totalPrice: 5400 }],
    }));

    expect(await screen.findByLabelText("單價 1")).toHaveValue("45");
    expect(screen.getAllByText("$5,400").length).toBeGreaterThan(0);
  });

  it("adds newly saved quote dishes that are missing from a local draft", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      lines: [{ id: "line-1", description: "雙拼飯盒", quantity: "120", unitPrice: "45" }],
    }));
    const twoLines: OrderDetailResult = {
      ...result,
      lines: [
        result.lines[0],
        { ...result.lines[0], id: "line-2", productName: "鹽酥雞扒滷肉飯" },
      ],
    };

    renderPage(vi.fn().mockResolvedValue(twoLines));

    expect(await screen.findByLabelText("產品 1")).toHaveValue("雙拼飯盒");
    expect(screen.getByLabelText("產品 2")).toHaveValue("鹽酥雞扒滷肉飯");
  });

  it("does not append a legacy utensil row when the quote already contains a utensil line", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      utensilPackQuantity: "1",
    }));
    const resultWithUtensil: OrderDetailResult = {
      ...lunchBoxResult,
      lines: [
        ...lunchBoxResult.lines,
        {
          id: "utensil-line",
          sku: null,
          productName: "餐具包",
          content: null,
          quantity: 1,
          unitPrice: 0,
          totalPrice: 0,
          isAddon: true,
          remarks: null,
        },
      ],
    };

    renderPage(vi.fn().mockResolvedValue(resultWithUtensil));

    expect(await screen.findByLabelText("產品 2")).toHaveValue("餐具包");
    expect(document.querySelector(".quote-pdf-utensil-row")).not.toBeInTheDocument();
  });

  it("loads the quote into editable fields", async () => {
    const loadDetail = renderPage();

    expect(await screen.findByRole("heading", { name: "到會套餐報價" })).toBeInTheDocument();
    expect(screen.getByLabelText("報價單號")).toHaveValue("FCCQ20260828");
    expect(screen.getByLabelText("報價日期")).toHaveValue("19/8/2026");
    expect(screen.getByLabelText("送貨日期")).toHaveValue("15/10/2026");
    const customerCompany = screen.getByTestId("quote-customer-company");
    expect(within(customerCompany).getByLabelText("客戶名稱")).toHaveValue("程嘉敏");
    expect(within(customerCompany).getByLabelText("公司名稱")).toHaveValue("STFA Seaward Woo College");
    expect(screen.getAllByText("quotes@foodchannels-catering.com").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("序號 1")).toHaveValue("1");
    expect(screen.getByLabelText("序號 1").tagName).toBe("INPUT");
    expect(screen.getByLabelText("產品 1")).toHaveValue("雙拼飯盒");
    expect(screen.getByLabelText("產品 1").tagName).toBe("INPUT");
    expect(screen.getByLabelText("送貨地址").tagName).toBe("TEXTAREA");
    const metadataLabels = Array.from(document.querySelectorAll(".quote-pdf-meta-grid label")).map((label) => label.textContent);
    expect(metadataLabels.indexOf("聯絡資料")).toBeLessThan(metadataLabels.indexOf("送貨日期"));
    expect(screen.getByLabelText("數量 1")).toHaveValue("120");
    expect(screen.getAllByText("$5,400")).toHaveLength(3);
    expect(loadDetail).toHaveBeenCalledWith("quote-1", "quote", true);
  });

  it("shows the Hong Kong delivery date when midnight is stored as the previous UTC day", async () => {
    const midnightDeliveryResult: OrderDetailResult = {
      ...result,
      order: result.order
        ? { ...result.order, deliveryAt: "2026-10-14T16:00:00.000Z" }
        : null,
    };

    renderPage(vi.fn().mockResolvedValue(midnightDeliveryResult));

    expect(await screen.findByLabelText("送貨日期")).toHaveValue("15/10/2026");
  });

  it("supports free-text additional information and searching templates", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    await user.click(screen.getByRole("button", { name: "新增額外資訊" }));
    const search = screen.getByLabelText("搜尋額外資訊");
    await user.type(search, "自訂內容也可以隨便寫");
    await user.click(within(search.closest(".quote-additional-search") as HTMLElement).getByRole("button", { name: "加入" }));

    expect(screen.getByLabelText("額外資訊 1")).toHaveValue("自訂內容也可以隨便寫");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(screen.queryByRole("dialog", { name: "額外資訊" })).not.toBeInTheDocument();

    const additional = screen.getByLabelText("額外資訊 1");
    await user.clear(additional);
    await user.type(additional, "請提供素食選擇");
    expect(additional).toHaveValue("請提供素食選擇");
    expect(additional).toHaveFocus();
  });

  it("allows Party Food quotes to add additional information", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn().mockResolvedValue(partyFoodResult));

    await screen.findByRole("heading", { name: "到會套餐報價" });
    await user.click(screen.getByRole("button", { name: "新增額外資訊" }));
    const search = screen.getByLabelText("搜尋額外資訊");
    await user.type(search, "Party Food 自訂資訊");
    await user.click(within(search.closest(".quote-additional-search") as HTMLElement).getByRole("button", { name: "加入" }));

    expect(screen.getByLabelText("額外資訊 1")).toHaveValue("Party Food 自訂資訊");
    expect(screen.queryByRole("region", { name: "活動報價表" })).not.toBeInTheDocument();
  });

  it.each([
    ["FCLQ20260828", "Cuisine"],
    ["FCKQ20260828", "Kitchen"],
    ["FCDQ20260828", "Delivery"],
    ["FCRQ20260828", "Residential"],
  ])("uses the catering package title for %s", async (orderNumber, channelName) => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      order: result.order ? { ...result.order, orderNumber, channelName } : null,
    }));

    expect(await screen.findByRole("heading", { name: "到會套餐報價" })).toBeInTheDocument();
  });

  it("edits existing product rows and automatically saves the working draft", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    await user.clear(screen.getByLabelText("產品 1"));
    await user.type(screen.getByLabelText("產品 1"), "自訂活動項目");
    await user.clear(screen.getByLabelText("單價 1"));
    await user.type(screen.getByLabelText("單價 1"), "300");
    expect(screen.getAllByText("$5,400").length).toBeGreaterThan(0);
    await user.tab();
    expect(screen.getAllByText("$36,000").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "儲存工作稿" })).not.toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}").lines[0].description).toBe("自訂活動項目"));
    expect(screen.queryByText("已自動儲存")).not.toBeInTheDocument();
  });

  it("lets staff edit or clear product sequence numbers", async () => {
    const user = userEvent.setup();
    const headerMenu: OrderDetailResult = {
      ...lunchBoxResult,
      lines: [
        { ...lunchBoxResult.lines[0], id: "line-1", productName: "12月4日 - 午餐選項", quantity: 0, unitPrice: 0, totalPrice: 0 },
        { ...lunchBoxResult.lines[0], id: "line-2", productName: "(雙格) 冬菇蒸肉餅飯", quantity: 0, unitPrice: 50, totalPrice: 0 },
      ],
    };
    renderPage(vi.fn().mockResolvedValue(headerMenu));

    const firstSequence = await screen.findByLabelText("序號 1");
    const secondSequence = screen.getByLabelText("序號 2");
    expect(firstSequence).toHaveValue("1");
    expect(secondSequence).toHaveValue("2");
    expect(document.querySelector(".quote-pdf-table")).toHaveClass("has-no-quantities");

    await user.clear(firstSequence);
    await user.tab();
    expect(firstSequence).toHaveValue("");
    await user.clear(secondSequence);
    await user.type(secondSequence, "1");
    await user.tab();
    expect(secondSequence).toHaveValue("1");

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}");
      expect(saved.lines[0].sequence).toBe("");
      expect(saved.lines[1].sequence).toBe("1");
    });
  });

  it("keeps custom sequence numbers when quote product names refresh", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      lines: [
        { id: "line-1", description: "舊標題", quantity: "0", unitPrice: "0", sequence: "" },
        { id: "line-2", description: "舊菜式", quantity: "0", unitPrice: "50", sequence: "1" },
      ],
    }));
    const headerMenu: OrderDetailResult = {
      ...lunchBoxResult,
      lines: [
        { ...lunchBoxResult.lines[0], id: "line-1", productName: "12月4日 - 午餐選項", quantity: 0, unitPrice: 0, totalPrice: 0 },
        { ...lunchBoxResult.lines[0], id: "line-2", productName: "(雙格) 冬菇蒸肉餅飯", quantity: 0, unitPrice: 50, totalPrice: 0 },
      ],
    };

    renderPage(vi.fn().mockResolvedValue(headerMenu));

    expect(await screen.findByLabelText("產品 1")).toHaveValue("12月4日 - 午餐選項");
    expect(screen.getByLabelText("序號 1")).toHaveValue("");
    expect(screen.getByLabelText("產品 2")).toHaveValue("(雙格) 冬菇蒸肉餅飯");
    expect(screen.getByLabelText("序號 2")).toHaveValue("1");
  });

  it("keeps typing in a PDF text field local until the field loses focus", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    await waitFor(() => expect(localStorage.getItem("fccd:quote-pdf-draft:quote-1")).not.toBeNull());
    const term = screen.getByLabelText("條款及細則 1");
    const originalTerm = JSON.parse(localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}").terms[0];

    await user.clear(term);
    await user.type(term, "完成整段修改後才儲存");

    expect(term).toHaveFocus();
    expect(term).toHaveValue("完成整段修改後才儲存");
    expect(JSON.parse(localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}").terms[0]).toBe(originalTerm);

    await user.tab();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}").terms[0]).toBe("完成整段修改後才儲存"));
  });

  it("does not show product deletion controls in the PDF table", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    const productTable = document.querySelector(".quote-pdf-table");
    expect(productTable).not.toBeNull();
    expect(within(productTable as HTMLElement).queryByRole("button", { name: "刪除產品 1" })).not.toBeInTheDocument();
    expect(within(productTable as HTMLElement).queryByRole("columnheader", { name: "刪除" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增產品" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "活動報價表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增額外資訊" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("折扣")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("扣除 CashDollar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("購買 CashDollar")).not.toBeInTheDocument();
  });

  it("loads a configured shipping fee while keeping subtotal and total read-only", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    await screen.findByRole("option", { name: "運費－新界區－地面交收" });
    await user.selectOptions(screen.getByLabelText("運費項目"), "fee-1");

    expect(screen.getByLabelText("運費項目")).toHaveClass("quote-pdf-edit-only");
    expect(document.querySelector(".quote-pdf-summary-rows .quote-pdf-print-only")).toHaveTextContent("運費－新界區－地面交收");
    expect(screen.getByLabelText("運費")).toHaveValue("100");
    expect(screen.getByText("小計：")).toHaveClass("quote-pdf-summary-label");
    expect(screen.getByText("總數：")).toHaveClass("quote-pdf-summary-label");
    expect(screen.getByText("$5,500")).toBeInTheDocument();
    expect(screen.queryByLabelText("小計")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("總數")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("運費"));
    await user.type(screen.getByLabelText("運費"), "150");
    expect(screen.getByText("$5,500")).toBeInTheDocument();
    await user.tab();
    expect(screen.getByText("$5,550")).toBeInTheDocument();
  });

  it("shows and deducts the saved discount in a standard quote PDF", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      order: result.order ? { ...result.order, discount: 100, grandTotal: 5300 } : null,
    }));

    await screen.findByRole("heading", { name: "到會套餐報價" });

    expect(screen.getByLabelText("折扣顯示文字")).toHaveValue("折扣 (-)");
    expect(screen.getByLabelText("折扣")).toHaveValue("100");
    expect(screen.getByText("$5,300")).toBeInTheDocument();
  });

  it("shows CashDollar rows on the generated quote PDF when amounts are present", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      order: result.order
        ? {
            ...result.order,
            cashdollarRedeemed: 50,
            cashdollarPurchased: 20,
            grandTotal: 5350,
          }
        : null,
    }));

    await screen.findByRole("heading", { name: "到會套餐報價" });

    expect(screen.getByText("扣除 CashDollar")).toBeInTheDocument();
    expect(screen.getByLabelText("扣除 CashDollar")).toHaveValue("50");
    expect(screen.getByText("購買 CashDollar")).toBeInTheDocument();
    expect(screen.getByLabelText("購買 CashDollar")).toHaveValue("20");
    expect(screen.getByText("$5,350")).toBeInTheDocument();
  });

  it("uses the lunch-box logo and shows unit price, servings, and line total", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "到會套餐報價" });
    await waitFor(() => expect(localStorage.getItem("fccd:quote-pdf-draft:quote-1")).not.toBeNull());
    cleanup();

    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    expect(await screen.findByRole("img", { name: "HK Lunch Box" })).toHaveAttribute(
      "src",
      "/assets/fcc-hk-lunch-box-logo.svg",
    );
    expect(screen.getByRole("columnheader", { name: "單價" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "份數" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "總數" })).toBeInTheDocument();
    expect(screen.getByLabelText("份數 1")).toHaveValue("120");
    expect(screen.getAllByText("$5,400")).toHaveLength(3);
  });

  it("hides lunch-box financial summary rows and follows the table with additional information", async () => {
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    expect(screen.queryByLabelText("運費項目")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("運費")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("折扣")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("扣除 CashDollar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("購買 CashDollar")).not.toBeInTheDocument();
    const tableWrap = document.querySelector(".quote-pdf-table-wrap");
    const additional = document.querySelector(".quote-pdf-additional") as HTMLElement;
    expect(additional).toHaveClass("is-empty");
    expect(within(additional).getByRole("button", { name: "新增額外資訊" })).toBeInTheDocument();
    expect(tableWrap).toBeInTheDocument();
  });

  it("shows the company stamp for every brand and reveals customer signing on request", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    expect(screen.getByRole("img", { name: "Food Channels Limited 公司蓋印" })).toHaveAttribute(
      "src",
      "/assets/fc-ltd-stamp.avif",
    );
    const toggle = screen.getByRole("checkbox", { name: "顯示客戶簽署" });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText("請仔細閱讀以上內容並簽署確認：")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText("請仔細閱讀以上內容並簽署確認：")).toBeInTheDocument();
    expect(screen.getByText("公司蓋印及簽署：")).toBeInTheDocument();
    expect(screen.getByLabelText("簽署公司或客戶名稱")).toHaveValue("STFA Seaward Woo College");
    expect(document.querySelector(".quote-pdf-signature-customer")).not.toHaveTextContent("程嘉敏");
    expect(document.querySelector(".quote-pdf-signature-stamp-spacer")).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();
  });

  it("shows the customer name in the signature when the company name is blank", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      order: result.order ? { ...result.order, companyName: null } : null,
    }));

    await screen.findByRole("heading", { name: "到會套餐報價" });
    await user.click(screen.getByRole("checkbox", { name: "顯示客戶簽署" }));

    expect(screen.getByLabelText("簽署公司或客戶名稱")).toHaveValue("程嘉敏");
  });

  it("lets the signature company or customer name be edited without changing the header fields", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    await user.click(screen.getByRole("checkbox", { name: "顯示客戶簽署" }));
    const signatureName = screen.getByLabelText("簽署公司或客戶名稱");
    await user.clear(signatureName);
    await user.type(signatureName, "簽名專用名稱");

    expect(signatureName).toHaveValue("簽名專用名稱");
    expect(screen.getByLabelText("公司名稱")).toHaveValue("STFA Seaward Woo College");
    expect(screen.getByLabelText("客戶名稱")).toHaveValue("程嘉敏");
  });

  it("does not insert a visible footer spacer between products and trailing content", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    expect(document.querySelector(".quote-pdf-print-footer-spacer")).not.toBeInTheDocument();
  });

  it("automatically continues long product tables on a new A4 sheet", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const page = this.closest<HTMLElement>(".quote-pdf-sheet");
      const pageIndex = page ? Array.from(document.querySelectorAll<HTMLElement>(".quote-pdf-sheet")).indexOf(page) : 0;
      const pageTop = pageIndex * 1200;
      if (this.classList.contains("quote-pdf-sheet")) {
        return { x: 0, y: pageTop, top: pageTop, right: 800, bottom: pageTop + 1000, left: 0, width: 800, height: 1000, toJSON: () => ({}) } as DOMRect;
      }
      if (this.hasAttribute("data-pdf-auto-footer")) {
        const top = pageTop + 970;
        return { x: 0, y: top, top, right: 800, bottom: top + 30, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    const longResult: OrderDetailResult = {
      ...result,
      lines: Array.from({ length: 18 }, (_, index) => ({
        ...result.lines[0],
        id: `line-${index + 1}`,
        productName: `產品 ${index + 1}`,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    try {
      expect(await screen.findAllByRole("heading", { name: "到會套餐報價" })).toHaveLength(2);
      const sheets = document.querySelectorAll(".quote-pdf-sheet");
      expect(sheets).toHaveLength(2);
      expect(sheets[0].querySelectorAll(".quote-pdf-table > tbody:first-of-type > tr")).toHaveLength(13);
      expect(sheets[1].querySelectorAll(".quote-pdf-table > tbody:first-of-type > tr")).toHaveLength(5);
      expect(within(sheets[1] as HTMLElement).getByLabelText("產品 18")).toHaveValue("產品 18");
      expect(sheets[0].querySelector(".quote-pdf-summary-rows")).not.toBeInTheDocument();
      expect(sheets[1].querySelector(".quote-pdf-summary-rows")).toBeInTheDocument();
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("continues the product table when totals cross the footer", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const page = this.closest<HTMLElement>(".quote-pdf-sheet");
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".quote-pdf-sheet"));
      const pageIndex = page ? pages.indexOf(page) : 0;
      const pageTop = pageIndex * 1200;
      if (this.classList.contains("quote-pdf-sheet")) {
        return { x: 0, y: pageTop, top: pageTop, right: 800, bottom: pageTop + 1000, left: 0, width: 800, height: 1000, toJSON: () => ({}) } as DOMRect;
      }
      if (this.hasAttribute("data-pdf-auto-footer")) {
        const top = pageTop + 970;
        return { x: 0, y: top, top, right: 800, bottom: top + 30, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }
      if (this.hasAttribute("data-pdf-auto-product-table")) {
        const hasTotals = Boolean(this.querySelector(".quote-pdf-summary-rows"));
        const bottom = pageTop + (hasTotals && pages.length === 1 ? 1050 : 900);
        return { x: 0, y: pageTop + 300, top: pageTop + 300, right: 800, bottom, left: 0, width: 800, height: bottom - pageTop - 300, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    const longResult: OrderDetailResult = {
      ...result,
      lines: Array.from({ length: 13 }, (_, index) => ({
        ...result.lines[0],
        id: `line-${index + 1}`,
        productName: `Product ${index + 1}`,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    try {
      await waitFor(() => expect(document.querySelectorAll(".quote-pdf-sheet")).toHaveLength(2));
      const sheets = document.querySelectorAll(".quote-pdf-sheet");
      expect(sheets[0].querySelectorAll("[data-pdf-auto-product-index]")).toHaveLength(12);
      expect(sheets[1].querySelectorAll("[data-pdf-auto-product-index]")).toHaveLength(1);
      expect(sheets[0].querySelector(".quote-pdf-summary-rows")).not.toBeInTheDocument();
      expect(sheets[1].querySelector(".quote-pdf-summary-rows")).toBeInTheDocument();
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("keeps the signature on the product page when only print-hidden modules overflow", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      if (this.classList.contains("quote-pdf-sheet")) {
        return { x: 0, y: 0, top: 0, right: 800, bottom: 1000, left: 0, width: 800, height: 1000, toJSON: () => ({}) } as DOMRect;
      }
      if (this.hasAttribute("data-pdf-auto-footer")) {
        return { x: 0, y: 970, top: 970, right: 800, bottom: 1000, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }
      const module = this.hasAttribute("data-pdf-auto-module-index") ? this : null;
      if (module) {
        if (module.querySelector(".quote-pdf-activity.is-empty")) {
          return { x: 0, y: 700, top: 700, right: 800, bottom: 900, left: 0, width: 800, height: 200, toJSON: () => ({}) } as DOMRect;
        }
        if (module.querySelector(".quote-pdf-additional.is-empty") || module.classList.contains("is-empty")) {
          return { x: 0, y: 580, top: 580, right: 800, bottom: 700, left: 0, width: 800, height: 120, toJSON: () => ({}) } as DOMRect;
        }
        if (module.querySelector(".quote-pdf-signature")) {
          return { x: 0, y: 980, top: 980, right: 800, bottom: 1140, left: 0, width: 800, height: 160, toJSON: () => ({}) } as DOMRect;
        }
        return { x: 0, y: 900, top: 900, right: 800, bottom: 980, left: 0, width: 800, height: 80, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      activities: [],
      additionalInfo: [],
      paymentMethods: [],
    }));
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    try {
      await screen.findByRole("heading", { name: "便當報價" });
      await waitFor(() => {
        expect(screen.getByRole("region", { name: "簽署確認" }).closest("main")).not.toHaveAccessibleName("PDF 第 2 頁");
        expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();
      });
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("moves overflowing trailing modules to another sheet instead of clipping the signature", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const isFooter = this.hasAttribute("data-pdf-auto-footer");
      const isOverflowingSignature = Boolean(this.querySelector(".quote-pdf-signature"))
        && this.closest<HTMLElement>("[data-pdf-auto-page]")?.dataset.pdfAutoPage === "products";
      const top = isFooter ? 1000 : 0;
      const bottom = isOverflowingSignature ? 1100 : 500;
      return { x: 0, y: top, top, right: 800, bottom, left: 0, width: 800, height: bottom - top, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      showCustomerSignature: true,
      additionalInfo: Array.from({ length: 5 }, (_, index) => `額外資訊 ${index + 1}`),
      activities: Array.from({ length: 3 }, (_, index) => ({
        id: `activity-${index + 1}`,
        description: `活動 ${index + 1}`,
        amount: "100",
      })),
    }));
    const longResult: OrderDetailResult = {
      ...lunchBoxResult,
      lines: Array.from({ length: 20 }, (_, index) => ({
        ...lunchBoxResult.lines[0],
        id: `line-${index + 1}`,
        productName: `產品 ${index + 1}`,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    try {
      await waitFor(() => expect(document.querySelectorAll(".quote-pdf-sheet")).toHaveLength(3));
      const sheets = document.querySelectorAll(".quote-pdf-sheet");
      expect(sheets[2].querySelector(".quote-pdf-signature")).toBeInTheDocument();
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("keeps clauses visible when overflowing content pushes the page footer outside the A4 sheet", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const page = this.closest<HTMLElement>(".quote-pdf-sheet");
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".quote-pdf-sheet"));
      const pageIndex = page ? pages.indexOf(page) : 0;
      const pageTop = pageIndex * 1200;

      if (this.classList.contains("quote-pdf-sheet")) {
        return { x: 0, y: pageTop, top: pageTop, right: 800, bottom: pageTop + 1000, left: 0, width: 800, height: 1000, toJSON: () => ({}) } as DOMRect;
      }
      if (this.hasAttribute("data-pdf-auto-footer")) {
        const top = page?.dataset.pdfAutoPage === "products" ? pageTop + 1200 : pageTop + 900;
        return { x: 0, y: top, top, right: 800, bottom: top + 30, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }

      const moduleIndex = Number(this.dataset.pdfAutoModuleIndex);
      if (page && Number.isInteger(moduleIndex)) {
        const modules = Array.from(page.querySelectorAll<HTMLElement>("[data-pdf-auto-module-index]"));
        const position = modules.indexOf(this);
        const start = page.dataset.pdfAutoPage === "products" ? 800 : 100;
        const top = pageTop + start + position * 120;
        return { x: 0, y: top, top, right: 800, bottom: top + 100, left: 0, width: 800, height: 100, toJSON: () => ({}) } as DOMRect;
      }

      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });

    renderPage();

    try {
      await waitFor(() => expect(document.querySelectorAll(".quote-pdf-sheet")).toHaveLength(2));
      expect(screen.getByLabelText("條款及細則 1").closest("main")).toHaveAttribute("data-pdf-auto-page", "products");
      expect(screen.getByLabelText("付款方式 1").closest("main")).toHaveAccessibleName("PDF 第 2 頁");
      expect(document.querySelectorAll("[aria-label='付款方式 1']")).toHaveLength(1);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("fills the remaining product-page space with clauses before continuing them", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const isFooter = this.hasAttribute("data-pdf-auto-footer");
      const moduleIndex = Number(this.dataset.pdfAutoModuleIndex);
      const isProductPage = this.closest<HTMLElement>("[data-pdf-auto-page]")?.dataset.pdfAutoPage === "products";
      const isLegacyWholeNotesBlock = Boolean(this.querySelector(".quote-pdf-notes")) && isProductPage;
      const top = isFooter ? 1000 : 0;
      const clauseBottom = isProductPage && Number.isInteger(moduleIndex) && moduleIndex >= 2 && moduleIndex <= 8
        ? 650 + (moduleIndex - 2) * 100
        : 500;
      const bottom = isLegacyWholeNotesBlock ? 1100 : clauseBottom;
      return { x: 0, y: top, top, right: 800, bottom, left: 0, width: 800, height: bottom - top, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      terms: Array.from({ length: 7 }, (_, index) => `條款 ${index + 1}`),
      paymentMethods: [],
    }));
    const longResult: OrderDetailResult = {
      ...lunchBoxResult,
      lines: Array.from({ length: 20 }, (_, index) => ({
        ...lunchBoxResult.lines[0],
        id: `line-${index + 1}`,
        productName: `產品 ${index + 1}`,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    try {
      const firstClause = await screen.findByLabelText("條款及細則 1");
      expect(firstClause.closest("main")).toHaveAccessibleName("PDF 第 2 頁");
      expect(screen.getByLabelText("條款及細則 5").closest("main")).toHaveAccessibleName("PDF 第 3 頁");
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("keeps every clause visible when a populated activity table consumes the remaining space", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const page = this.closest<HTMLElement>(".quote-pdf-sheet");
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".quote-pdf-sheet"));
      const pageIndex = page ? pages.indexOf(page) : 0;
      const pageTop = pageIndex * 1200;
      if (this.hasAttribute("data-pdf-auto-footer")) {
        return { x: 0, y: pageTop + 1000, top: pageTop + 1000, right: 800, bottom: pageTop + 1030, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }
      const moduleIndex = Number(this.dataset.pdfAutoModuleIndex);
      if (page && Number.isInteger(moduleIndex)) {
        const modules = Array.from(page.querySelectorAll<HTMLElement>("[data-pdf-auto-module-index]"));
        const modulePosition = modules.indexOf(this);
        const heightFor = (element: HTMLElement) => {
          const index = Number(element.dataset.pdfAutoModuleIndex);
          if (index === 0) return 100;
          if (index === 1) return 350;
          if (index >= 2 && index <= 8) return 60;
          if (index === 9) return 50;
          return 200;
        };
        const start = page.dataset.pdfAutoPage === "products" ? 600 : 100;
        const top = pageTop + start + modules.slice(0, modulePosition).reduce((total, element) => total + heightFor(element), 0);
        const height = heightFor(this);
        return { x: 0, y: top, top, right: 800, bottom: top + height, left: 0, width: 800, height, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      showCustomerSignature: true,
      additionalInfo: Array.from({ length: 5 }, (_, index) => `額外資訊 ${index + 1}`),
      activities: Array.from({ length: 3 }, (_, index) => ({ id: `activity-${index}`, description: `活動 ${index + 1}`, amount: "100" })),
      terms: Array.from({ length: 7 }, (_, index) => `條款 ${index + 1}`),
      paymentMethods: [],
    }));
    const longResult: OrderDetailResult = {
      ...lunchBoxResult,
      lines: Array.from({ length: 20 }, (_, index) => ({ ...lunchBoxResult.lines[0], id: `line-${index + 1}` })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    try {
      await waitFor(() => {
        for (let index = 1; index <= 7; index += 1) {
          const clause = screen.getByLabelText(`條款及細則 ${index}`);
          const page = clause.closest("main");
          const footer = page?.querySelector<HTMLElement>("[data-pdf-auto-footer]");
          expect(clause.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer?.getBoundingClientRect().top ?? 0);
        }
      });
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("repaginates when rendered content becomes taller after the first measurement", async () => {
    let activityHeight = 100;
    let notifyResize: (() => void) | undefined;
    const resizeCallbacks = new Set<() => void>();
    class ResizeObserverMock {
      private readonly callback: () => void;

      constructor(callback: ResizeObserverCallback) {
        this.callback = () => callback([], this as unknown as ResizeObserver);
        resizeCallbacks.add(this.callback);
        notifyResize = () => resizeCallbacks.forEach((resizeCallback) => resizeCallback());
      }
      observe() {}
      disconnect() { resizeCallbacks.delete(this.callback); }
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const page = this.closest<HTMLElement>(".quote-pdf-sheet");
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".quote-pdf-sheet"));
      const pageIndex = page ? pages.indexOf(page) : 0;
      const pageTop = pageIndex * 1200;
      if (this.hasAttribute("data-pdf-auto-footer")) {
        return { x: 0, y: pageTop + 1000, top: pageTop + 1000, right: 800, bottom: pageTop + 1030, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }
      const moduleIndex = Number(this.dataset.pdfAutoModuleIndex);
      if (page && Number.isInteger(moduleIndex)) {
        const modules = Array.from(page.querySelectorAll<HTMLElement>("[data-pdf-auto-module-index]"));
        const heightFor = (element: HTMLElement) => {
          const index = Number(element.dataset.pdfAutoModuleIndex);
          if (index === 0) return 50;
          if (index === 1) return activityHeight;
          if (index >= 2 && index <= 8) return 50;
          return 100;
        };
        const modulePosition = modules.indexOf(this);
        const start = page.dataset.pdfAutoPage === "products" ? 300 : 100;
        const top = pageTop + start + modules.slice(0, modulePosition).reduce((total, element) => total + heightFor(element), 0);
        const height = heightFor(this);
        return { x: 0, y: top, top, right: 800, bottom: top + height, left: 0, width: 800, height, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      additionalInfo: ["額外資訊"],
      activities: [{ id: "activity-1", description: "活動", amount: "100" }],
      terms: Array.from({ length: 7 }, (_, index) => `條款 ${index + 1}`),
      paymentMethods: [],
    }));
    const longResult: OrderDetailResult = {
      ...lunchBoxResult,
      lines: Array.from({ length: 20 }, (_, index) => ({ ...lunchBoxResult.lines[0], id: `line-${index + 1}` })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    try {
      const firstClause = await screen.findByLabelText("條款及細則 1");
      expect(firstClause.closest("main")).toHaveAccessibleName("PDF 第 2 頁");
      activityHeight = 500;
      await act(async () => notifyResize?.());
      await waitFor(() => expect(screen.getByLabelText("條款及細則 3").closest("main")).toHaveAccessibleName("PDF 第 3 頁"));
    } finally {
      rectSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not restore focus or scroll for a measurement-only resize", async () => {
    let moduleHeight = 50;
    let notifyResize: (() => void) | undefined;
    const resizeCallbacks = new Set<() => void>();
    class ResizeObserverMock {
      private readonly callback: () => void;

      constructor(callback: ResizeObserverCallback) {
        this.callback = () => callback([], this as unknown as ResizeObserver);
        resizeCallbacks.add(this.callback);
        notifyResize = () => resizeCallbacks.forEach((resizeCallback) => resizeCallback());
      }
      observe() {}
      disconnect() { resizeCallbacks.delete(this.callback); }
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.hasAttribute("data-pdf-auto-module-index")) {
        return { x: 0, y: 100, top: 100, right: 800, bottom: 100 + moduleHeight, left: 0, width: 800, height: moduleHeight, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    renderPage();

    try {
      await screen.findByRole("heading", { name: /PDF|報價|到會/ });
      const field = document.querySelector<HTMLInputElement>(".quote-pdf-product-input");
      expect(field).not.toBeNull();
      field!.focus();
      const focusSpy = vi.spyOn(field!, "focus");

      moduleHeight = 60;
      await act(async () => notifyResize?.());

      expect(focusSpy).not.toHaveBeenCalled();
      focusSpy.mockRestore();
    } finally {
      rectSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the caret when a resized field is moved to another PDF page", async () => {
    let activityHeight = 100;
    let notifyResize: (() => void) | undefined;
    const resizeCallbacks = new Set<() => void>();
    class ResizeObserverMock {
      private readonly callback: () => void;

      constructor(callback: ResizeObserverCallback) {
        this.callback = () => callback([], this as unknown as ResizeObserver);
        resizeCallbacks.add(this.callback);
        notifyResize = () => resizeCallbacks.forEach((resizeCallback) => resizeCallback());
      }
      observe() {}
      disconnect() { resizeCallbacks.delete(this.callback); }
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const page = this.closest<HTMLElement>(".quote-pdf-sheet");
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".quote-pdf-sheet"));
      const pageIndex = page ? pages.indexOf(page) : 0;
      const pageTop = pageIndex * 1200;
      if (this.hasAttribute("data-pdf-auto-footer")) {
        return { x: 0, y: pageTop + 1000, top: pageTop + 1000, right: 800, bottom: pageTop + 1030, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }
      const moduleIndex = Number(this.dataset.pdfAutoModuleIndex);
      if (page && Number.isInteger(moduleIndex)) {
        const modules = Array.from(page.querySelectorAll<HTMLElement>("[data-pdf-auto-module-index]"));
        const heightFor = (element: HTMLElement) => {
          const index = Number(element.dataset.pdfAutoModuleIndex);
          if (index === 0) return 50;
          if (index === 1) return activityHeight;
          if (index >= 2 && index <= 8) return 50;
          return 100;
        };
        const modulePosition = modules.indexOf(this);
        const start = page.dataset.pdfAutoPage === "products" ? 300 : 100;
        const top = pageTop + start + modules.slice(0, modulePosition).reduce((total, element) => total + heightFor(element), 0);
        const height = heightFor(this);
        return { x: 0, y: top, top, right: 800, bottom: top + height, left: 0, width: 800, height, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      additionalInfo: ["額外資訊"],
      activities: [{ id: "activity-1", description: "活動", amount: "100" }],
      terms: Array.from({ length: 7 }, (_, index) => `條款 ${index + 1}`),
      paymentMethods: [],
    }));
    const longResult: OrderDetailResult = {
      ...lunchBoxResult,
      lines: Array.from({ length: 20 }, (_, index) => ({ ...lunchBoxResult.lines[0], id: `line-${index + 1}` })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    try {
      const clause = await screen.findByLabelText("條款及細則 3") as HTMLTextAreaElement;
      clause.focus();
      fireEvent.change(clause, { target: { value: "刪短" } });
      clause.setSelectionRange(2, 2);
      expect(clause.closest("main")).toHaveAccessibleName("PDF 第 2 頁");

      activityHeight = 500;
      await act(async () => notifyResize?.());

      await waitFor(() => {
        const movedClause = screen.getByLabelText("條款及細則 3") as HTMLTextAreaElement;
        expect(movedClause.closest("main")).toHaveAccessibleName("PDF 第 3 頁");
        expect(document.activeElement).toBe(movedClause);
        expect(movedClause).toHaveValue("刪短");
        expect(movedClause.selectionStart).toBe(2);
        expect(movedClause.selectionEnd).toBe(2);
      });

      const movedClause = screen.getByLabelText("條款及細則 3") as HTMLTextAreaElement;
      activityHeight = 100;
      await act(async () => notifyResize?.());
      expect(movedClause.closest("main")).toHaveAccessibleName("PDF 第 3 頁");
      expect(document.activeElement).toBe(movedClause);

      await act(async () => movedClause.blur());
      await waitFor(() => {
        const mergedClause = screen.getByLabelText("條款及細則 3");
        expect(mergedClause.closest("main")).toHaveAccessibleName("PDF 第 3 頁");
        expect(mergedClause).toHaveValue("刪短");
      });
    } finally {
      rectSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the signing block in sequence without manual page controls", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      showCustomerSignature: true,
      signatureStartsNewPage: true,
    }));
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    expect(screen.getByRole("region", { name: "簽署確認" })).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上移一頁" })).not.toBeInTheDocument();
  });

  it("keeps the activity block in sequence without manual page controls", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      activities: [{ id: "activity-1", description: "10月15日 120個飯盒", amount: "5400" }],
    }));
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    const activity = screen.getByRole("region", { name: "活動報價表" });
    expect(activity.closest("main")).not.toHaveAccessibleName("PDF 第 2 頁");
    expect(screen.getByRole("button", { name: "新增活動項目" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "下移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上移一頁" })).not.toBeInTheDocument();
  });

  it("keeps totals for product quantities without rendering or paginating an empty activity table", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      activities: [],
      activityStartsNewPage: true,
    }));
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    const activitySummary = screen.getByRole("region", { name: "活動報價表" });
    expect(activitySummary).toHaveClass("is-empty");
    expect(within(activitySummary).queryByRole("columnheader", { name: "活動報價" })).not.toBeInTheDocument();
    expect(within(activitySummary).queryByText("尚未新增活動項目")).not.toBeInTheDocument();
    expect(within(activitySummary).getByText("小計：")).toBeInTheDocument();
    expect(within(activitySummary).getByLabelText("活動運費")).toBeInTheDocument();
    expect(within(activitySummary).getByText("總數：")).toBeInTheDocument();
    expect(within(activitySummary).getAllByText("$5,400")).toHaveLength(2);
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "新增活動項目" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "下移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上移一頁" })).not.toBeInTheDocument();
  });

  it("hides activity totals when there are no product quantities or activity quotes", async () => {
    const emptyLunchBoxResult: OrderDetailResult = {
      ...lunchBoxResult,
      lines: lunchBoxResult.lines.map((line) => ({
        ...line,
        quantity: 0,
        totalPrice: 0,
      })),
    };
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      activities: [],
    }));
    renderPage(vi.fn().mockResolvedValue(emptyLunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    expect(screen.queryByRole("region", { name: "活動報價表" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增活動項目" })).toBeEnabled();
  });

  it("opens the activity picker and adds a priced activity item", async () => {
    const user = userEvent.setup();
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      discountLabel: "9.5折扣",
    }));
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    const discountLabel = screen.getByLabelText("折扣顯示文字");
    expect(discountLabel).toHaveValue("9.5折扣");
    await user.clear(discountLabel);
    await user.type(discountLabel, "VIP折扣");
    await user.tab();
    await waitFor(() => expect(JSON.parse(
      localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}",
    ).discountLabel).toBe("VIP折扣"));
    await user.click(screen.getByRole("button", { name: "新增活動項目" }));
    const dialog = screen.getByRole("dialog", { name: "活動報價" });
    await user.type(within(dialog).getByLabelText("搜尋活動報價"), "10月15日");
    const activityOption = within(dialog).getByText("10月15日 120個飯盒").closest("li");
    expect(activityOption).not.toBeNull();
    await user.click(within(activityOption as HTMLElement).getByRole("button", { name: "加入" }));
    await user.click(within(dialog).getByRole("button", { name: "確定" }));

    expect(screen.getByLabelText("活動報價 1")).toHaveValue("10月15日 120個飯盒");
    expect(screen.getByLabelText("活動價錢 1")).toHaveValue("5400");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getAllByText("$10,800")).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText("活動運費項目"), "fee-1");
    expect(screen.getByLabelText("活動運費項目")).toHaveClass("quote-pdf-edit-only");
    expect(document.querySelector(".quote-pdf-activity .quote-pdf-print-only")).toHaveTextContent("運費－新界區－地面交收");
    expect(screen.getByLabelText("活動運費")).toHaveValue("100");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$10,900")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("活動運費"));
    await user.type(screen.getByLabelText("活動運費"), "150");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$10,900")).toBeInTheDocument();
    await user.tab();
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$10,950")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("活動折扣"));
    await user.type(screen.getByLabelText("活動折扣"), "200");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$10,950")).toBeInTheDocument();
    await user.tab();
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$10,750")).toBeInTheDocument();
  });

  it("repairs saved product and activity shipping selections whose amounts are still zero", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      shippingFeeId: "fee-1",
      shippingFeeLabel: "",
      shippingFee: "0",
      activityShippingFeeId: "fee-1",
      activityShippingNote: "",
      activityShippingFee: "0",
    }));
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    const activitySummary = screen.getByRole("region", { name: "活動報價表" });
    await waitFor(() => expect(within(activitySummary).getByLabelText("活動運費")).toHaveValue("100"));
    expect(within(activitySummary).getByText("$5,500")).toBeInTheDocument();
  });

  it("automatically adds a searchable activity shipping fee to the blue total", async () => {
    const user = userEvent.setup();
    const manyShippingFees = Array.from({ length: 11 }, (_, index) => ({
      id: `fee-${index + 1}`,
      item: `活動運費 ${index + 1}`,
      fee: (index + 1) * 100,
      createdAt: "2026-08-01T00:00:00Z",
    }));
    renderPage(
      vi.fn().mockResolvedValue(lunchBoxResult),
      vi.fn().mockResolvedValue(manyShippingFees),
    );

    await screen.findByRole("heading", { name: "便當報價" });
    const activitySummary = screen.getByRole("region", { name: "活動報價表" });
    await user.click(within(activitySummary).getByRole("combobox", { name: "活動運費項目" }));
    await user.click(within(screen.getByRole("listbox", { name: "活動運費項目" })).getByRole("option", { name: "活動運費 11" }));

    expect(within(activitySummary).getByLabelText("活動運費")).toHaveValue("1100");
    expect(within(activitySummary).getByText("$6,500")).toBeInTheDocument();
  });

  it("adds and edits individual terms and payment methods from searchable dialogs", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    expect(screen.getByLabelText("條款及細則 1")).toHaveValue("報價有效期為14天");
    expect(screen.getByLabelText("付款方式 1")).toHaveValue("銀行轉帳");

    await user.click(screen.getByRole("button", { name: "條款及細則：" }));
    const termsDialog = screen.getByRole("dialog", { name: "條款及細則" });
    await user.type(within(termsDialog).getByLabelText("搜尋條款及細則"), "自訂條例內容");
    await user.click(within(termsDialog).getAllByRole("button", { name: "加入" })[0]);
    expect(screen.getByLabelText("條款及細則 2")).toHaveValue("自訂條例內容");
    expect(within(termsDialog).getByText("（2）自訂條例內容")).toBeInTheDocument();
    await user.click(within(termsDialog).getByRole("button", { name: "確定" }));

    await user.click(screen.getByRole("button", { name: "我們提供以下付款方式：" }));
    const paymentDialog = screen.getByRole("dialog", { name: "付款方式" });
    await user.type(within(paymentDialog).getByLabelText("搜尋付款方式"), "轉數快");
    const fpsOption = within(paymentDialog).getByText(/FPS ID: 102938271/).closest("li");
    expect(fpsOption).not.toBeNull();
    await user.click(within(fpsOption as HTMLElement).getByRole("button", { name: "加入" }));
    expect((screen.getByLabelText("付款方式 2") as HTMLTextAreaElement).value).toContain("FPS ID: 102938271");
  });

  it("keeps empty notes editable while marking them to be hidden from PDF output", async () => {
    renderPage(vi.fn().mockResolvedValue({ ...result, terms: [], paymentMethods: [] }));

    await screen.findByRole("heading", { name: "到會套餐報價" });
    expect(screen.getByRole("button", { name: "條款及細則：" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "我們提供以下付款方式：" })).toBeInTheDocument();
    expect(document.querySelector(".quote-pdf-notes")).toHaveClass("is-empty");
    expect(document.querySelectorAll(".quote-pdf-note-block.is-empty")).toHaveLength(2);
  });

  it("keeps terms and payment methods in sequence without manual page controls", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    expect(document.querySelector(".quote-pdf-notes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();
  });
});
