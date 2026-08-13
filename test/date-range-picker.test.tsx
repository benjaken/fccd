import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DateRangePicker } from "@/components/ui/date-range-picker";

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
    expect(
      screen.getByRole("group", { name: "日期範圍" }),
    ).toBeInTheDocument();

    const start = screen.getByLabelText("開始日期");
    const end = screen.getByLabelText("結束日期");
    expect(start).toHaveAttribute("type", "date");
    expect(end).toHaveAttribute("type", "date");
    expect(start).toHaveAttribute("max", "2026-08-13");
    expect(end).toHaveAttribute("min", "2026-08-01");

    await user.clear(start);
    await user.type(start, "2026-08-05");
    expect(onStartChange).toHaveBeenCalled();
  });
});
