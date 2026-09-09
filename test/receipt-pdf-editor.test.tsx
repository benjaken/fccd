import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptPdfEditorPage } from "@/components/ReceiptPdfEditorPage";
import type { OrderDetailResult } from "@/lib/order-details";

const result: OrderDetailResult = {
  order: {
    id: "order-1",
    documentType: "order",
    channelId: "brand-1",
    channelName: "Catering",
    channelEmail: "orders@hklunchbox.com",
    shopifyStoreDomain: "hklunchbox.myshopify.com",
    orderNumber: "B-1547",
    customerName: "Momo",
    companyName: "Momo Company",
    email: "momo@example.com",
    contactA: "53007575",
    contactB: null,
    address: "上水古洞金錢南路140號雙魚小丘 *車邊交收",
    customerNote: null,
    internalNote: null,
    quoteStatus: null,
    quoteDescription: null,
    deliveryTerms: null,
    createdAt: "2026-08-20T02:00:00+08:00",
    deliveryAt: "2026-09-04T02:00:00+08:00",
    deliveryTime: "16:45 - 17:15",
    shipOutTime: null,
    deliveryStatus: "已送達",
    isSentToFactory: true,
    factoryDate: null,
    factoryPackingNote: null,
    factoryPrintDate: null,
    factoryReprintRequired: false,
    currency: "HKD",
    discount: 0,
    shippingFee: 30,
    grandTotal: 1650,
    outstanding: 0,
    updatedAt: "2026-08-21T02:00:00+08:00",
    statuses: [],
  },
  lines: [
    {
      id: "line-1",
      sku: null,
      productName: "雙格 雞扒意粉",
      content: null,
      quantity: 14,
      unitPrice: 45,
      totalPrice: 630,
      isAddon: false,
      remarks: null,
    },
    {
      id: "line-2",
      sku: null,
      productName: "雙格 蘑菇豬扒意粉",
      content: null,
      quantity: 10,
      unitPrice: 99,
      totalPrice: 990,
      isAddon: false,
      remarks: null,
    },
  ],
  deliveries: [],
  payments: [],
  timeline: [],
  terms: [],
  paymentMethods: [],
  quoteFiles: [],
};

const shippingFees = [
  { id: "fee-1", item: "運費－新界區－地面交收", fee: 100, createdAt: "2026-08-01T00:00:00Z" },
];

function renderPage(
  loadDetail = vi.fn().mockResolvedValue(result),
  loadShippingFees = vi.fn().mockResolvedValue(shippingFees),
) {
  render(
    <MemoryRouter initialEntries={["/orders/order-1/receipt"]}>
      <Routes>
        <Route path="/orders/:id/receipt" element={<ReceiptPdfEditorPage loadDetail={loadDetail} loadShippingFees={loadShippingFees} />} />
      </Routes>
    </MemoryRouter>,
  );
  return loadDetail;
}

function measuredProductRowRect(element: HTMLElement) {
  const lineIndex = Number(element.dataset.pdfAutoProductIndex);
  const page = element.closest<HTMLElement>(".quote-pdf-sheet");
  if (!page || !Number.isInteger(lineIndex)) return null;

  const rows = Array.from(page.querySelectorAll<HTMLElement>("[data-pdf-auto-product-index]"));
  const position = rows.indexOf(element);
  const top = position * 60;
  const height = 60;
  return { x: 0, y: top, top, right: 800, bottom: top + height, left: 0, width: 800, height, toJSON: () => ({}) } as DOMRect;
}

describe("Receipt PDF editor", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ["receipt", "/orders/order-1/receipt", "RECEIPT"],
    ["invoice", "/orders/order-1/invoice", "INVOICE"],
  ] as const)("excludes voided products from the %s", async (documentKind, route, heading) => {
    const detailWithVoidedLine: OrderDetailResult = {
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
    };

    render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path="/orders/:id/:documentKind"
            element={(
              <ReceiptPdfEditorPage
                documentKind={documentKind}
                loadDetail={vi.fn().mockResolvedValue(detailWithVoidedLine)}
                loadShippingFees={vi.fn().mockResolvedValue(shippingFees)}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Cancelled product must not print")).not.toBeInTheDocument();
  });

  it("opens the REC action as an editable receipt with only the reference content", async () => {
    const loadDetail = renderPage();

    expect(await screen.findByRole("heading", { name: "RECEIPT" })).toBeInTheDocument();
    expect(loadDetail).toHaveBeenCalledWith("order-1", "order", true);
    expect(screen.getByRole("img", { name: "HK Lunch Box" })).toHaveAttribute(
      "src",
      "/assets/fcc-hk-lunch-box-logo.svg",
    );
    expect(screen.getByLabelText("收據編號")).toHaveValue("REC/B-1547");
    expect(screen.getByLabelText("Customer Name:")).toHaveValue("Momo");
    expect(screen.getByLabelText("Company Name:")).toHaveValue("Momo Company");
    expect(screen.getByLabelText("Contact Person:")).toHaveValue("53007575");
    expect(screen.getByLabelText("Invoice Date:")).toHaveValue("20/8/2026");
    expect(screen.getByLabelText("Delivery Date:")).toHaveValue("4/9/2026");
    expect(screen.getByLabelText("Delivery Time:")).toHaveValue("16:45 - 17:15");
    expect(screen.getByLabelText("Delivery Address:")).toHaveAttribute("rows", "2");
    expect(screen.getByLabelText("付款資料")).toHaveValue("Payment Status: Paid");
    expect(screen.getByRole("img", { name: "Food Channels Limited 公司蓋印" })).toHaveAttribute(
      "src",
      "/assets/fc-ltd-stamp.avif",
    );

    const receipt = screen.getByRole("main", { name: "收據 PDF" });
    expect(within(receipt).getByText("orders@hklunchbox.com")).toBeInTheDocument();
    expect(within(receipt).getByRole("columnheader", { name: "Description" })).toBeInTheDocument();
    expect(within(receipt).getByText("$1,650")).toBeInTheDocument();
    expect(screen.queryByText("公司認證及獎項")).not.toBeInTheDocument();
    expect(screen.queryByText("條款及細則")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增額外資訊" })).not.toBeInTheDocument();
  });

  it("uses the Hong Kong calendar date for invoice timestamps near midnight", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      order: {
        ...result.order,
        createdAt: "2026-08-23T16:30:00.000Z",
      },
    }));

    expect(await screen.findByLabelText("Invoice Date:")).toHaveValue("24/8/2026");
  });

  it("shows and deducts the saved discount in the invoice PDF", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue({
            ...result,
            order: result.order ? { ...result.order, discount: 100, grandTotal: 1550 } : null,
          })} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    const invoice = await screen.findByRole("main", { name: "發票 PDF" });
    expect(within(invoice).getByText("Discount:")).toBeInTheDocument();
    expect(within(invoice).getByLabelText("折扣")).toHaveValue("100");
    expect(within(invoice).getByText("$1,550")).toBeInTheDocument();
  });

  it("keeps receipt number edits only for the current page session", async () => {
    const user = userEvent.setup();
    renderPage();

    const receiptNumber = await screen.findByLabelText("收據編號");
    expect(receiptNumber).not.toHaveAttribute("readonly");
    await user.clear(receiptNumber);
    await user.type(receiptNumber, "REC/CUSTOM-A");
    await user.tab();

    expect(receiptNumber).toHaveValue("REC/CUSTOM-A");
    expect(window.localStorage.getItem("fccd:receipt-pdf-draft:order-1")).toBeNull();

    cleanup();
    renderPage();
    expect(await screen.findByLabelText("收據編號")).toHaveValue("REC/B-1547");
  });

  it("ignores stale browser PDF data and always loads the latest source data", async () => {
    localStorage.setItem("fccd:receipt-pdf-draft:order-1", JSON.stringify({
      receiptNumber: "REC/STALE",
      customer: "舊客戶",
      contactPerson: "00000000",
      deliveryAddress: "舊地址",
      deliveryDate: "1/1/2020",
      deliveryTime: "00:00 - 00:30",
      lines: [{ id: "line-1", description: "舊產品", unitPrice: "1", quantity: "1" }],
      paymentInformation: "舊付款狀態",
    }));

    renderPage();

    expect(await screen.findByLabelText("收據編號")).toHaveValue("REC/B-1547");
    expect(screen.getByLabelText("Customer Name:")).toHaveValue("Momo");
    expect(screen.getByLabelText("Company Name:")).toHaveValue("Momo Company");
    expect(screen.getByLabelText("Contact Person:")).toHaveValue("53007575");
    expect(screen.getByLabelText("Delivery Address:")).toHaveValue("上水古洞金錢南路140號雙魚小丘 *車邊交收");
    expect(screen.getByLabelText("Delivery Date:")).toHaveValue("4/9/2026");
    expect(screen.getByLabelText("Delivery Time:")).toHaveValue("16:45 - 17:15");
    expect(screen.getByLabelText("產品 1")).toHaveValue("雙格 雞扒意粉");
    expect(screen.getByLabelText("單價 1")).toHaveValue("45");
    expect(screen.getByLabelText("付款資料")).toHaveValue("Payment Status: Paid");
  });

  it("keeps invoice clauses and signing in document order without manual page controls", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue({ ...result, terms: ["訂單付款後方會確認。"], paymentMethods: ["銀行轉帳。"] })} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "INVOICE" })).toBeInTheDocument();
    expect(screen.getByLabelText("發票編號")).toHaveValue("INV/B-1547");
    expect(screen.getByLabelText("發票編號")).not.toHaveAttribute("readonly");
    const firstPage = screen.getByRole("main", { name: "發票 PDF" });
    expect(within(firstPage).getByLabelText("條款及細則 1")).toHaveValue("訂單付款後方會確認。");
    expect(within(firstPage).getByLabelText("付款方式 1")).toHaveValue("銀行轉帳。");
    expect(within(firstPage).getByLabelText("發票簽署")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "下移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上移一頁" })).not.toBeInTheDocument();
  });

  it("marks empty invoice clauses so print output can omit them without a blank page", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue(result)} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "INVOICE" });
    const notes = screen.getByLabelText("條款及付款方式");
    expect(notes).toHaveClass("is-empty");
    expect(screen.queryByRole("main", { name: "發票 PDF 第 2 頁" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /條款及細則/ }));
    const termsDialog = screen.getByRole("dialog", { name: "條款及細則" });
    expect(termsDialog).toBeInTheDocument();
    await user.type(within(termsDialog).getByLabelText("搜尋條款及細則"), "新增條款");
    await user.click(within(termsDialog).getByRole("button", { name: "加入" }));
    expect(screen.getByLabelText("條款及細則 1")).toHaveValue("新增條款");
    expect(screen.getByLabelText("條款及付款方式")).not.toHaveClass("is-empty");

    await user.click(within(termsDialog).getByRole("button", { name: "確定" }));
    await user.click(screen.getByRole("button", { name: /付款方式/ }));
    expect(screen.getByRole("dialog", { name: "付款方式" })).toBeInTheDocument();
  });

  it("keeps a populated invoice trailing group directly after the product rows", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue({ ...result, lines: Array.from({ length: 8 }, (_, index) => ({ ...result.lines[0], id: `line-${index + 1}` })) })} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "INVOICE" });
    const firstPage = screen.getByRole("main", { name: "發票 PDF" });
    expect(within(firstPage).getByLabelText("發票簽署")).toBeInTheDocument();
    expect(within(firstPage).getByLabelText("條款、付款方式及簽署")).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "發票 PDF 第 2 頁" })).not.toBeInTheDocument();
  });

  it("lets the invoice signature company or customer name be edited", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue(result)} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "INVOICE" });
    await user.click(screen.getByRole("checkbox", { name: "顯示客戶簽署" }));
    const signatureName = screen.getByLabelText("簽署公司或客戶名稱");
    expect(signatureName).toHaveValue("Momo Company");
    await user.clear(signatureName);
    await user.type(signatureName, "簽名客戶");
    expect(signatureName).toHaveValue("簽名客戶");
  });

  it("recalculates totals without persisting receipt edits", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "RECEIPT" });
    await user.clear(screen.getByLabelText("單價 1"));
    await user.type(screen.getByLabelText("單價 1"), "50");
    expect(screen.getByText("$1,650")).toBeInTheDocument();
    await user.tab();
    expect(screen.getByText("$1,690")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("運費選項"), "fee-1");

    expect(screen.getByText("$1,790")).toBeInTheDocument();
    expect(screen.getByLabelText("運費")).toHaveValue("100");
    expect(document.querySelector(".quote-pdf-print-only")).toHaveTextContent("運費－新界區－地面交收");
    expect(screen.queryByText("已自動儲存")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("fccd:receipt-pdf-draft:order-1")).toBeNull();
  });

  it("ignores zero totals from legacy receipt drafts", async () => {
    localStorage.setItem("fccd:receipt-pdf-draft:order-1", JSON.stringify({
      lines: result.lines.map((line) => ({
        id: line.id,
        description: line.productName,
        quantity: String(line.quantity),
        unitPrice: "0",
      })),
    }));

    renderPage();

    expect(await screen.findByLabelText("單價 1")).toHaveValue("45");
    expect(screen.getByText("$1,650")).toBeInTheDocument();
  });

  it("derives a missing receipt unit price from the saved line total", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      lines: [{ ...result.lines[0], unitPrice: null, totalPrice: 630 }],
    }));

    expect(await screen.findByLabelText("單價 1")).toHaveValue("45");
    expect(screen.getByText("$660")).toBeInTheDocument();
  });

  it("uses the order number for the receipt reference and keeps payment details in sequence", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      payments: [{
        id: "payment-1",
        amount: 1650,
        currency: "HKD",
        paymentAt: "2026-08-20T00:00:00+08:00",
        payoutAt: null,
        paymentMethod: null,
        reference: "#6939",
        receiptReference: "#6939",
      }],
    }));

    expect(await screen.findByLabelText("收據編號")).toHaveValue("REC/B-1547");
    const firstPage = screen.getByRole("main", { name: "收據 PDF" });
    expect(within(firstPage).getByLabelText("付款資料及公司蓋章")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上移一頁" })).not.toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "收據 PDF 第 2 頁" })).not.toBeInTheDocument();
  });

  it("keeps eleven receipt lines on the first sheet instead of splitting after ten", async () => {
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      lines: Array.from({ length: 11 }, (_, index) => ({
        ...result.lines[0],
        id: `line-${index + 1}`,
        productName: `產品 ${index + 1}`,
      })),
    }));

    expect(await screen.findByRole("heading", { name: "RECEIPT" })).toBeInTheDocument();
    const sheets = document.querySelectorAll(".receipt-pdf-sheet");
    expect(sheets).toHaveLength(1);
    expect(sheets[0].querySelectorAll(".receipt-pdf-table tbody tr")).toHaveLength(11);
    expect(sheets[0].querySelector("tfoot")).toBeInTheDocument();
  });

  it("keeps eleven invoice lines together and marks its only sheet as the final print page", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue({
            ...result,
            lines: Array.from({ length: 11 }, (_, index) => ({
              ...result.lines[0],
              id: `line-${index + 1}`,
              productName: `產品 ${index + 1}`,
            })),
          })} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "INVOICE" })).toBeInTheDocument();
    const sheets = document.querySelectorAll(".receipt-pdf-sheet");
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toHaveClass("is-final-document-page");
    expect(sheets[0].querySelectorAll(".receipt-pdf-table tbody tr")).toHaveLength(11);
    expect(sheets[0].querySelector("tfoot")).toBeInTheDocument();
  });

  it("automatically continues long receipt product tables on the next A4 sheet", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const productRowRect = measuredProductRowRect(this);
      if (productRowRect) return productRowRect;
      const page = this.closest<HTMLElement>(".receipt-pdf-sheet");
      const pageIndex = page ? Array.from(document.querySelectorAll<HTMLElement>(".receipt-pdf-sheet")).indexOf(page) : 0;
      const pageTop = pageIndex * 1200;
      if (this.classList.contains("receipt-pdf-sheet")) {
        return { x: 0, y: pageTop, top: pageTop, right: 800, bottom: pageTop + 1000, left: 0, width: 800, height: 1000, toJSON: () => ({}) } as DOMRect;
      }
      if (this.hasAttribute("data-pdf-auto-footer")) {
        const top = pageTop + 970;
        return { x: 0, y: top, top, right: 800, bottom: top + 30, left: 0, width: 800, height: 30, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 800, bottom: 0, left: 0, width: 800, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    renderPage(vi.fn().mockResolvedValue({
      ...result,
      lines: Array.from({ length: 18 }, (_, index) => ({
        ...result.lines[0],
        id: `line-${index + 1}`,
        productName: `產品 ${index + 1}`,
      })),
    }));

    try {
      expect(await screen.findAllByRole("heading", { name: "RECEIPT" })).toHaveLength(2);
      const sheets = document.querySelectorAll(".receipt-pdf-sheet");
      expect(sheets).toHaveLength(2);
      expect(sheets[0].querySelectorAll(".receipt-pdf-table tbody tr")).toHaveLength(16);
      expect(sheets[1].querySelectorAll(".receipt-pdf-table tbody tr")).toHaveLength(2);
      expect(sheets[0].querySelector("tfoot")).not.toBeInTheDocument();
      expect(sheets[1].querySelector("tfoot")).toBeInTheDocument();
      expect(within(sheets[1] as HTMLElement).getByLabelText("產品 18")).toHaveValue("產品 18");
    } finally {
      rectSpy.mockRestore();
    }
  });
});
