import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SupplierQuotePage } from "@/components/SupplierQuotePage";

describe("SupplierQuotePage", () => {
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
});
