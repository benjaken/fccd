import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { findSimilarSupplierOptions, initialReviewDates, SupplierQuotePage } from "@/components/SupplierQuotePage";

describe("SupplierQuotePage", () => {
  it("flags a recognized supplier that closely resembles an existing supplier", () => {
    const matches = findSimilarSupplierOptions("A-Mart Gourmet Ltd. 浩運食品有限公司", [
      { id: "am", name: "A-Mart 浩運食品 (AM)" },
      { id: "other", name: "Euro Foodstuff" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ option: { id: "am", name: "A-Mart 浩運食品 (AM)" } });
    expect(matches[0].score).toBeGreaterThanOrEqual(0.8);
  });

  it("leaves conflicting detected dates blank until the user chooses", () => {
    const source = (value: string, sourceType: "filename" | "content") => ({ value, sourceType, sourcePage: null, sourceText: value, confidence: 0.8 });
    expect(initialReviewDates([source("2026-08-01", "filename"), source("2026-08-05", "content")], null, null))
      .toEqual({ conflict: true, quoteDate: "", effectiveDate: "" });
    expect(initialReviewDates([source("2026-08-01", "content")], null, null))
      .toEqual({ conflict: false, quoteDate: "2026-08-01", effectiveDate: "2026-08-01" });
  });
  it("renders the frozen quote comparison with separate quote and inbound prices", () => {
    render(<SupplierQuotePage />);

    expect(screen.getByRole("heading", { name: "供應商報價分析" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "報價比較明細" })).toBeInTheDocument();
    expect(screen.getByText("PDF quoted price")).toBeInTheDocument();
    expect(screen.getByText("Actual inbound price")).toBeInTheDocument();
    expect(screen.getAllByText("TBA／待確認").length).toBeGreaterThan(0);
    expect(screen.queryByText("HK$0.00")).not.toBeInTheDocument();
  });

  it("opens configurable thresholds and filters comparison rows", () => {
    render(<SupplierQuotePage />);

    fireEvent.click(screen.getByRole("button", { name: "門檻設定" }));
    expect(screen.getByRole("dialog", { name: "異常門檻設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("上漲門檻 (%)")).toHaveValue(10);

    fireEvent.change(screen.getByLabelText("上漲門檻 (%)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "保存設定" }));
    expect(screen.getByText("異常門檻已套用到目前比較結果。")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "狀態" }), {
      target: { value: "異常" },
    });
    expect(screen.getByText("報價比較明細")).toBeInTheDocument();
    expect(screen.getAllByText("異常").length).toBeGreaterThan(0);
  });

  it("opens a single-meat quote and inbound price chart from the product row", () => {
    render(<SupplierQuotePage />);

    fireEvent.click(screen.getByRole("button", { name: "查看 急凍去皮雞扒 價格走勢" }));

    expect(
      screen.getByRole("dialog", { name: "急凍去皮雞扒 · 價格走勢" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "急凍去皮雞扒 PDF 報價歷史圖表" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "急凍去皮雞扒 實際入貨價圖表" })).toBeInTheDocument();
  });

  it("requires identity confirmation and keeps low-confidence or warning rows unselected", () => {
    const { container } = render(<SupplierQuotePage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["%PDF-redacted"], "supplier.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    const reviewProgress = screen.getByRole("progressbar", { name: "PDF 上傳、AI 識別及人工審核總進度" });
    const progressBeforeIdentityCheck = Number(reviewProgress.getAttribute("aria-valuenow"));
    expect(screen.getAllByText(/人工審核中/).length).toBeGreaterThan(0);
    const reviewPanel = screen.getByRole("dialog", { name: "確認 PDF 商品對應" });
    expect(reviewPanel).toHaveClass("side-panel-majority");
    expect(reviewPanel).toHaveClass("supplier-quote-review-panel-90");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(reviewPanel).getByRole("button", { name: "PDF 適合寬度" })).toHaveTextContent("175%");
    expect(within(reviewPanel).getByRole("button", { name: "放大 PDF" })).toBeInTheDocument();
    expect(within(reviewPanel).getByLabelText("可拖動 PDF 畫布")).toBeInTheDocument();
    expect(screen.getByText("供應商與日期必須由你確認")).toBeInTheDocument();
    expect(within(reviewPanel).getByRole("combobox", { name: "供應商" })).toBeInTheDocument();
    fireEvent.click(within(reviewPanel).getByRole("combobox", { name: "供應商" }));
    fireEvent.change(within(reviewPanel).getByRole("searchbox", { name: "搜尋供應商名稱或編號" }), {
      target: { value: "New Frozen Foods Ltd" },
    });
    fireEvent.click(within(reviewPanel).getByRole("button", { name: "新增「New Frozen Foods Ltd」" }));
    expect(within(reviewPanel).getByText("保存審核時會新增此供應商。")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("PDF 原文證據")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("PDF 識別出的凍肉")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("系統內的凍肉商品")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("AI 對應建議")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("統一比較價格：")).toBeInTheDocument();
    expect(within(reviewPanel).getByText(/HK\$39\.80 \/ kg/)).toBeInTheDocument();
    expect(screen.queryByLabelText("選取 豬腩片")).not.toBeInTheDocument();
    expect(screen.queryByText(/price_unit_requires_review/)).not.toBeInTheDocument();
    const showUnmatched = screen.getByRole("checkbox", { name: /顯示未對應商品/ });
    expect(showUnmatched).not.toBeChecked();
    fireEvent.click(showUnmatched);
    expect(screen.getByLabelText("選取 豬腩片")).not.toBeChecked();
    expect(screen.getByText(/price_unit_requires_review/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /確認並保存/ });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText("我已核對供應商、報價日期及生效日期"));
    expect(Number(reviewProgress.getAttribute("aria-valuenow"))).toBeGreaterThan(progressBeforeIdentityCheck);
    expect(submit).not.toBeDisabled();
  });

  it("shows OCR and retryable failure states with safe available actions", () => {
    render(<SupplierQuotePage />);
    fireEvent.click(screen.getByRole("button", { name: "PDF 報價版本" }));
    expect(screen.getByText("需 OCR")).toBeInTheDocument();
    expect(screen.getByText("PDF 沒有可抽取文字；本期需另行 OCR，不會產生候選。")).toBeInTheDocument();
    expect(screen.getByText("識別失敗")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新識別 retryable-price-list.pdf" })).toBeInTheDocument();
  });

  it("can reopen an uploaded review document from the PDF versions list", () => {
    render(<SupplierQuotePage />);
    fireEvent.click(screen.getByRole("button", { name: "PDF 報價版本" }));
    const reviewVersion = screen.getByText("review-pending.pdf").closest("article");
    expect(reviewVersion).not.toBeNull();
    fireEvent.click(within(reviewVersion!).getByRole("button", { name: "審核 review-pending.pdf" }));
    const reviewPanel = screen.getByRole("dialog", { name: "確認 PDF 商品對應" });
    expect(reviewPanel).toHaveClass("supplier-quote-review-panel-90");
    expect(within(reviewPanel).getByLabelText("PDF 原文預覽")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("正在載入 PDF")).toBeInTheDocument();
    expect(within(reviewPanel).queryByText(/找不到原 PDF 預覽/)).not.toBeInTheDocument();
  });
});
