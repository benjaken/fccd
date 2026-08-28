import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DateRangePicker } from "@/components/ui/date-range-picker";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function RangePickerHarness() {
  const [start, setStart] = useState("2026-08-01");
  const [end, setEnd] = useState("2026-08-13");

  return (
    <DateRangePicker
      startId="range-start"
      endId="range-end"
      startValue={start}
      endValue={end}
      onStartChange={setStart}
      onEndChange={setEnd}
      startLabel="開始日期"
      endLabel="結束日期"
      legend="日期範圍"
    />
  );
}

describe("DateRangePicker", () => {
  it("uses the official Calendar range selection without closing after the first date", async () => {
    const user = userEvent.setup();
    const { container } = render(<RangePickerHarness />);

    expect(container.querySelector('input[type="date"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: /2026\/08\/01.*2026\/08\/13/ }));

    let popover = document.querySelector<HTMLElement>(".date-range-picker-popover");
    const startDay = within(popover!).getAllByRole("button").find((button) => button.textContent === "2");
    await user.click(startDay!);

    expect(document.querySelector(".date-range-picker-popover")).not.toBeNull();
    expect(screen.getByRole("button", { name: /2026\/08\/02.*結束日期/ })).toBeInTheDocument();

    popover = document.querySelector<HTMLElement>(".date-range-picker-popover");
    const endDay = within(popover!).getAllByRole("button").find((button) => button.textContent === "5");
    await user.click(endDay!);
    expect(screen.getByRole("button", { name: /2026\/08\/02.*2026\/08\/05/ })).toBeInTheDocument();
    expect(document.querySelector(".date-range-picker-popover")).toBeNull();
  });

  it("follows the shadcn Calendar range composition", () => {
    const source = readFileSync(join(repoRoot, "src/components/ui/date-range-picker.tsx"), "utf8");

    expect(source).toContain('mode="range"');
    expect(source).toContain("onSelect={(range)");
    expect(source).not.toContain("onDayClick");
    expect(source).not.toMatch(/type=["']date["']/);
  });
});
