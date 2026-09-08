import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "@/components/ui/date-picker";
import { selectDate } from "./calendar-test-helpers";

describe("DatePicker", () => {
  it("closes its popover after selecting a date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker id="payout-date" value="2026-09-09" onChange={onChange} label="Payout date" />);

    await selectDate(user, screen.getByRole("combobox", { name: "Payout date" }), "2026-09-10");

    expect(onChange).toHaveBeenCalledWith("2026-09-10");
    expect(document.querySelector(".date-picker-popover")).not.toBeInTheDocument();
  });
});
