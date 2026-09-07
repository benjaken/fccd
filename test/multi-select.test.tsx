import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MultiSelect } from "@/components/ui/multi-select";

describe("MultiSelect", () => {
  it("portals the open menu outside clipping containers", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <MultiSelect
          id="festival-filter"
          labelledBy="festival-label"
          options={[{ id: "festival-1", name: "中秋節" }]}
          value={[]}
          onChange={onChange}
          placeholder="全部節日"
          searchPlaceholder="搜尋節日"
          emptyLabel="暫無節日資料"
        />
      </div>,
    );

    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");

    expect(container).not.toContainElement(listbox);
    expect(document.body).toContainElement(listbox);
    expect(listbox.closest("[data-slot='popover-content']")).toHaveClass("multi-select-menu-portal");

    await user.click(screen.getByRole("option", { name: "中秋節" }));
    expect(onChange).toHaveBeenCalledWith(["festival-1"]);
  });
});
