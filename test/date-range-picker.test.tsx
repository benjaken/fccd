import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DateRangePicker } from "@/components/ui/date-range-picker";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("DateRangePicker", () => {
  it("renders start and end dates as one range control", async () => {
    const user = userEvent.setup();
    const onStartChange = vi.fn();
    const onEndChange = vi.fn();

    const { container } = render(
      <DateRangePicker
        startId="range-start"
        endId="range-end"
        startValue="2026-08-01"
        endValue="2026-08-13"
        onStartChange={onStartChange}
        onEndChange={onEndChange}
        startLabel="開始日期"
        endLabel="結束日期"
        legend="日期範圍"
      />,
    );

    expect(container.querySelector(".date-range-picker")).not.toBeNull();
    expect(container.querySelector(".date-range-picker-control")).not.toBeNull();
    expect(container.querySelector(".date-range-picker-field")).toBeNull();
    expect(
      screen.getByRole("group", { name: "日期範圍" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".date-range-picker-label")?.textContent).toBe("日期範圍");

    const start = screen.getByLabelText("開始日期");
    const end = screen.getByLabelText("結束日期");
    expect(start).toHaveAttribute("type", "date");
    expect(end).toHaveAttribute("type", "date");
    expect(start).toHaveAttribute("max", "2026-08-13");
    expect(end).toHaveAttribute("min", "2026-08-01");
    expect(start.parentElement).toBe(end.parentElement);
    expect(start.parentElement).toHaveClass("date-range-picker-control");

    await user.clear(start);
    await user.type(start, "2026-08-05");
    expect(onStartChange).toHaveBeenCalled();
  });

  it("keeps the range on one row and is the only date input control", () => {
    const css = readFileSync(join(repoRoot, "src/index.css"), "utf8");
    const controlBlock = css.slice(
      css.indexOf(".date-range-picker-control {"),
      css.indexOf(".date-range-picker-control:focus-within"),
    );

    expect(controlBlock).toContain("flex-wrap: nowrap");
    expect(css).not.toContain(".date-range-picker-field");

    const pickerSource = readFileSync(
      join(repoRoot, "src/components/ui/date-range-picker.tsx"),
      "utf8",
    );
    expect(pickerSource).toContain('type="date"');

    const pagesWithDates = [
      "src/components/settings/AttachmentsListPage.tsx",
      "src/components/ReportsPage.tsx",
      "src/components/SupplierPurchaseReport.tsx",
      "src/components/DeliveryListPage.tsx",
    ];

    for (const relativePath of pagesWithDates) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      expect(source).toContain("DateRangePicker");
      expect(source).not.toMatch(/type=["']date["']/);
    }
  });
});
