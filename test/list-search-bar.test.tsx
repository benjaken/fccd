import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ListSearchBar } from "@/components/ui/list-search-bar";

describe("ListSearchBar", () => {
  it("keeps the search icon inside the field and submits the trimmed action", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { container } = render(
      <ListSearchBar
        id="unit-list-search"
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        label="搜尋訂單"
        placeholder="訂單號或客戶"
        submitLabel="搜尋"
      />,
    );

    const field = container.querySelector(".search-field");
    expect(field).not.toBeNull();
    expect(field?.querySelector("svg")).not.toBeNull();

    const input = screen.getByRole("searchbox", { name: "搜尋訂單" });
    expect(input).toBe(field?.querySelector("input"));

    await user.type(input, "B-1513");
    expect(onChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "搜尋" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits when Enter is pressed in the field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ListSearchBar
        id="unit-list-search-enter"
        value="ready"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        label="搜尋"
        submitLabel="搜尋"
      />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: "搜尋" }),
      "{Enter}",
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
