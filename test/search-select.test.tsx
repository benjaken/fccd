import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchSelect } from "@/components/ui/search-select";

describe("SearchSelect", () => {
  it("filters options by supplier name and selects the result", () => {
    const onChange = vi.fn();
    render(
      <SearchSelect
        id="supplier"
        label="供應商"
        options={[
          { id: "a-mart", name: "A-Mart" },
          { id: "tai-fung", name: "泰豐食品" },
          { id: "", name: "待確認供應商" },
        ]}
        value=""
        onChange={onChange}
        searchPlaceholder="搜尋供應商名稱或編號"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "供應商" }));
    const menu = screen.getByRole("combobox", { name: "搜尋供應商名稱或編號" }).closest(".multi-select-menu");
    expect(menu).toHaveClass("multi-select-menu-portal");
    fireEvent.change(screen.getByRole("combobox", { name: "搜尋供應商名稱或編號" }), {
      target: { value: "泰豐" },
    });

    expect(screen.getByRole("option", { name: /泰豐食品/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /A-Mart/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /泰豐食品/ }));
    expect(onChange).toHaveBeenCalledWith({ id: "tai-fung", name: "泰豐食品" });
  });

  it("supports keyboard selection from filtered results", () => {
    const onChange = vi.fn();
    render(
      <SearchSelect
        id="keyboard-supplier"
        label="供應商"
        options={[{ id: "euro", name: "Euro Foodstuff" }]}
        value=""
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "供應商" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "搜尋" }), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ id: "euro", name: "Euro Foodstuff" });
  });

  it("offers a new supplier when no existing name matches", () => {
    const onCreate = vi.fn();
    render(
      <SearchSelect
        id="new-supplier"
        label="供應商"
        options={[{ id: "a-mart", name: "A-Mart" }]}
        value=""
        onChange={vi.fn()}
        onCreate={onCreate}
        searchPlaceholder="搜尋供應商"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "供應商" }));
    fireEvent.change(screen.getByRole("combobox", { name: "搜尋供應商" }), {
      target: { value: "New Frozen Foods Ltd" },
    });
    fireEvent.click(screen.getByRole("option", { name: "新增「New Frozen Foods Ltd」" }));
    expect(onCreate).toHaveBeenCalledWith("New Frozen Foods Ltd");
  });
});
