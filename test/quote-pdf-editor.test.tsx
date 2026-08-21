import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { QuotePdfEditorPage } from "@/components/QuotePdfEditorPage";
import type { OrderDetailResult } from "@/lib/order-details";

const result: OrderDetailResult = {
  order: {
    id: "quote-1",
    documentType: "quote",
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

describe("editable quote PDF page", () => {
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

  it("repairs legacy auto-saved drafts that do not contain product lines", async () => {
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      quoteNumber: "FCCQ20260828",
      customerName: "舊草稿客戶",
    }));

    renderPage();

    expect(await screen.findByRole("heading", { name: "到會套餐報價" })).toBeInTheDocument();
    expect(screen.getByLabelText("產品 1")).toHaveValue("雙拼飯盒");
    expect(screen.getByLabelText("客戶名稱")).toHaveValue("舊草稿客戶");
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
    expect(screen.getByLabelText("產品 1")).toHaveValue("雙拼飯盒");
    expect(screen.getByLabelText("產品 1").tagName).toBe("INPUT");
    expect(screen.getByLabelText("送貨地址").tagName).toBe("TEXTAREA");
    const metadataLabels = Array.from(document.querySelectorAll(".quote-pdf-meta-grid label")).map((label) => label.textContent);
    expect(metadataLabels.indexOf("聯絡資料")).toBeLessThan(metadataLabels.indexOf("送貨日期"));
    expect(screen.getByLabelText("數量 1")).toHaveValue("120");
    expect(screen.getAllByText("$5,400")).toHaveLength(3);
    expect(loadDetail).toHaveBeenCalledWith("quote-1", "quote", true);
  });

  it("supports free-text additional information and searching templates", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    await user.click(screen.getByRole("button", { name: "新增額外資訊" }));
    const search = screen.getByLabelText("搜尋額外資訊");
    await user.type(search, "自訂內容也可以隨便寫");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByLabelText("額外資訊 1")).toHaveValue("自訂內容也可以隨便寫");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(screen.queryByRole("dialog", { name: "額外資訊" })).not.toBeInTheDocument();
  });

  it("allows Party Food quotes to add additional information", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn().mockResolvedValue(partyFoodResult));

    await screen.findByRole("heading", { name: "到會套餐報價" });
    await user.click(screen.getByRole("button", { name: "新增額外資訊" }));
    await user.type(screen.getByLabelText("搜尋額外資訊"), "Party Food 自訂資訊");
    await user.click(screen.getByRole("button", { name: "Add" }));

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
    expect(screen.queryByRole("button", { name: "儲存工作稿" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("已自動儲存")).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}").lines[0].description).toBe("自訂活動項目");
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
    expect(screen.getByText("$5,550")).toBeInTheDocument();
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
    expect(screen.getByText("$5,400")).toBeInTheDocument();
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
    expect(screen.getByText("程嘉敏")).toBeInTheDocument();
    expect(document.querySelector(".quote-pdf-signature-stamp-spacer")).toBeInTheDocument();
  });

  it("does not insert a visible footer spacer between products and trailing content", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    expect(document.querySelector(".quote-pdf-print-footer-spacer")).not.toBeInTheDocument();
  });

  it("automatically continues long product tables on a new A4 sheet", async () => {
    const longResult: OrderDetailResult = {
      ...result,
      lines: Array.from({ length: 18 }, (_, index) => ({
        ...result.lines[0],
        id: `line-${index + 1}`,
        productName: `產品 ${index + 1}`,
      })),
    };
    renderPage(vi.fn().mockResolvedValue(longResult));

    expect(await screen.findAllByRole("heading", { name: "到會套餐報價" })).toHaveLength(2);
    const sheets = document.querySelectorAll(".quote-pdf-sheet");
    expect(sheets).toHaveLength(2);
    expect(sheets[0].querySelectorAll(".quote-pdf-table > tbody:first-of-type > tr")).toHaveLength(10);
    expect(sheets[1].querySelectorAll(".quote-pdf-table > tbody:first-of-type > tr")).toHaveLength(8);
    expect(within(sheets[1] as HTMLElement).getByLabelText("產品 18")).toHaveValue("產品 18");
    expect(sheets[0].querySelector(".quote-pdf-summary-rows")).not.toBeInTheDocument();
    expect(sheets[1].querySelector(".quote-pdf-summary-rows")).toBeInTheDocument();
  });

  it("moves the signing block to its own PDF page", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    const controls = screen.getByRole("generic", { name: "客戶簽署分頁控制" });
    await user.click(within(controls).getByRole("button", { name: "下移一頁" }));

    const secondPage = screen.getByRole("main", { name: "PDF 第 2 頁" });
    expect(within(secondPage).getByRole("region", { name: "簽署確認" })).toBeInTheDocument();
    const secondPageControls = within(secondPage).getByRole("generic", { name: "客戶簽署分頁控制" });
    await user.click(within(secondPageControls).getByRole("button", { name: "上移一頁" }));
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();
  });

  it("moves the activity block between PDF pages", async () => {
    const user = userEvent.setup();
    localStorage.setItem("fccd:quote-pdf-draft:quote-1", JSON.stringify({
      activities: [{ id: "activity-1", description: "10月15日 120個飯盒", amount: "5400" }],
    }));
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    const activity = screen.getByRole("region", { name: "活動報價表" });
    const activityControls = screen.getByLabelText("活動報價分頁控制");
    const moveDown = within(activityControls).getByRole("button", { name: "下移一頁" });
    const moveUp = within(activityControls).getByRole("button", { name: "上移一頁" });
    expect(activity.closest("main")).not.toHaveAccessibleName("PDF 第 2 頁");
    expect(moveUp).toBeDisabled();

    await user.click(moveDown);
    const secondPage = screen.getByRole("main", { name: "PDF 第 2 頁" });
    expect(within(secondPage).getByRole("region", { name: "活動報價表" })).toBeInTheDocument();
    expect(within(secondPage).getByRole("img", { name: "HK Lunch Box" })).toBeInTheDocument();
    expect(within(secondPage).getByRole("img", { name: "公司認證及獎項" })).toBeInTheDocument();
    expect(within(secondPage).getByText("FCBQ20260828")).toBeInTheDocument();

    const secondPageActivityControls = within(secondPage).getByLabelText("活動報價分頁控制");
    await user.click(within(secondPageActivityControls).getByRole("button", { name: "上移一頁" }));
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();
  });

  it("keeps totals without rendering or paginating an empty activity table", async () => {
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
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();

    const controls = screen.getByLabelText("活動報價分頁控制");
    expect(within(controls).getByRole("button", { name: "下移一頁" })).toBeDisabled();
    expect(within(controls).getByRole("button", { name: "上移一頁" })).toBeDisabled();
    expect(within(controls).getByRole("button", { name: "新增活動項目" })).toBeEnabled();
  });

  it("opens the activity picker and adds a priced activity item", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn().mockResolvedValue(lunchBoxResult));

    await screen.findByRole("heading", { name: "便當報價" });
    await user.click(screen.getByRole("button", { name: "新增活動項目" }));
    const dialog = screen.getByRole("dialog", { name: "活動報價" });
    await user.type(within(dialog).getByLabelText("搜尋活動報價"), "10月15日");
    await user.click(within(dialog).getByRole("button", { name: "加入" }));

    expect(screen.getByLabelText("活動報價 1")).toHaveValue("10月15日 120個飯盒");
    expect(screen.getByLabelText("活動價錢 1")).toHaveValue("5400");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getAllByText("$5,400")).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText("活動運費項目"), "fee-1");
    expect(screen.getByLabelText("活動運費項目")).toHaveClass("quote-pdf-edit-only");
    expect(document.querySelector(".quote-pdf-activity .quote-pdf-print-only")).toHaveTextContent("運費－新界區－地面交收");
    expect(screen.getByLabelText("活動運費")).toHaveValue("100");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$5,500")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("活動運費"));
    await user.type(screen.getByLabelText("活動運費"), "150");
    expect(within(screen.getByRole("region", { name: "活動報價表" })).getByText("$5,550")).toBeInTheDocument();
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

  it("moves the terms and payment methods block between PDF pages", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "到會套餐報價" });
    const controls = screen.getByRole("generic", { name: "條款及付款方式分頁控制" });
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();

    await user.click(within(controls).getByRole("button", { name: "下移一頁" }));
    const secondPage = screen.getByRole("main", { name: "PDF 第 2 頁" });
    expect(secondPage.querySelector(".quote-pdf-notes")).toBeInTheDocument();
    expect(within(secondPage).getByText("條款及付款方式已移至下一頁")).toBeInTheDocument();

    const secondPageControls = within(secondPage).getByRole("generic", { name: "條款及付款方式分頁控制" });
    await user.click(within(secondPageControls).getByRole("button", { name: "上移一頁" }));
    expect(screen.queryByRole("main", { name: "PDF 第 2 頁" })).not.toBeInTheDocument();
  });
});
