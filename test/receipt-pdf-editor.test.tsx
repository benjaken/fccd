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
    shopifyStoreDomain: "hklunchbox.myshopify.com",
    orderNumber: "B-1547",
    customerName: "Momo",
    companyName: null,
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

describe("Receipt PDF editor", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the REC action as an editable receipt with only the reference content", async () => {
    const loadDetail = renderPage();

    expect(await screen.findByRole("heading", { name: "RECEIPT" })).toBeInTheDocument();
    expect(loadDetail).toHaveBeenCalledWith("order-1", "order", true);
    expect(screen.getByRole("img", { name: "HK Lunch Box" })).toHaveAttribute(
      "src",
      "/assets/fcc-hk-lunch-box-logo.svg",
    );
    expect(screen.getByLabelText("收據編號")).toHaveValue("REC/");
    expect(screen.getByLabelText("Customer:")).toHaveValue("Momo");
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
    expect(within(receipt).getByRole("columnheader", { name: "Description" })).toBeInTheDocument();
    expect(within(receipt).getByText("$1,650")).toBeInTheDocument();
    expect(screen.queryByText("公司認證及獎項")).not.toBeInTheDocument();
    expect(screen.queryByText("條款及細則")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增額外資訊" })).not.toBeInTheDocument();
  });

  it("supports invoice clauses and moves the complete invoice trailing group together", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue({ ...result, terms: ["訂單付款後方會確認。"], paymentMethods: ["銀行轉帳。"] })} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "INVOICE" })).toBeInTheDocument();
    expect(screen.queryByLabelText("發票編號")).not.toBeInTheDocument();
    expect(screen.queryByText("INV/")).not.toBeInTheDocument();
    const firstPage = screen.getByRole("main", { name: "發票 PDF" });
    expect(within(firstPage).getByLabelText("條款及細則 1")).toHaveValue("訂單付款後方會確認。");
    expect(within(firstPage).getByLabelText("付款方式 1")).toHaveValue("銀行轉帳。");
    expect(within(firstPage).getByLabelText("發票簽署")).toBeInTheDocument();

    await user.click(within(firstPage).getByRole("button", { name: "下移一頁" }));
    const secondPage = screen.getByRole("main", { name: "發票 PDF 第 2 頁" });
    expect(within(firstPage).queryByLabelText("條款、付款方式及簽署")).not.toBeInTheDocument();
    expect(within(secondPage).getByLabelText("條款、付款方式及簽署")).toBeInTheDocument();
    expect(within(secondPage).getByLabelText("條款及細則 1")).toBeInTheDocument();
    expect(within(secondPage).getByLabelText("付款方式 1")).toBeInTheDocument();
    expect(within(secondPage).getByLabelText("發票簽署")).toBeInTheDocument();
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

  it("starts a populated invoice trailing group on page two when product rows would clip it", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/order-1/invoice"]}>
        <Routes>
          <Route path="/orders/:id/invoice" element={<ReceiptPdfEditorPage documentKind="invoice" loadDetail={vi.fn().mockResolvedValue({ ...result, lines: Array.from({ length: 8 }, (_, index) => ({ ...result.lines[0], id: `line-${index + 1}` })) })} loadShippingFees={vi.fn().mockResolvedValue(shippingFees)} />} />
        </Routes>
      </MemoryRouter>,
    );

    const secondPage = await screen.findByRole("main", { name: "發票 PDF 第 2 頁" });
    expect(within(secondPage).getByLabelText("發票簽署")).toBeInTheDocument();
    expect(within(screen.getByRole("main", { name: "發票 PDF" })).queryByLabelText("條款、付款方式及簽署")).not.toBeInTheDocument();
  });

  it("recalculates totals and automatically saves receipt edits", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "RECEIPT" });
    await user.clear(screen.getByLabelText("單價 1"));
    await user.type(screen.getByLabelText("單價 1"), "50");
    await user.selectOptions(screen.getByLabelText("運費選項"), "fee-1");

    expect(screen.getByText("$1,790")).toBeInTheDocument();
    expect(screen.getByLabelText("運費")).toHaveValue("100");
    expect(document.querySelector(".quote-pdf-print-only")).toHaveTextContent("運費－新界區－地面交收");
    await waitFor(() => expect(screen.getByText("已自動儲存")).toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem("fccd:receipt-pdf-draft:order-1") || "{}").lines[0].unitPrice).toBe("50");
  });

  it("uses only a real receipt reference and moves the payment block between pages", async () => {
    const user = userEvent.setup();
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

    expect(await screen.findByLabelText("收據編號")).toHaveValue("REC/#6939");
    const firstPage = screen.getByRole("main", { name: "收據 PDF" });
    const controls = screen.getByLabelText("付款及蓋章分頁控制");
    expect(within(controls).getByRole("button", { name: "上移一頁" })).toBeDisabled();

    await user.click(within(controls).getByRole("button", { name: "下移一頁" }));
    const secondPage = screen.getByRole("main", { name: "收據 PDF 第 2 頁" });
    expect(within(firstPage).queryByLabelText("付款資料及公司蓋章")).not.toBeInTheDocument();
    expect(within(secondPage).getByLabelText("付款資料及公司蓋章")).toBeInTheDocument();

    await user.click(within(secondPage).getByRole("button", { name: "上移一頁" }));
    expect(screen.queryByRole("main", { name: "收據 PDF 第 2 頁" })).not.toBeInTheDocument();
    expect(within(firstPage).getByLabelText("付款資料及公司蓋章")).toBeInTheDocument();
  });
});
