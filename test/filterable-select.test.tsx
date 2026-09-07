import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FilterableSelect } from "@/components/ui/filterable-select";
import i18n from "@/i18n";

function Example() {
  const [value, setValue] = useState("");
  return (
    <FilterableSelect
      aria-label="品牌"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    >
      <option value="">全部品牌</option>
      <option value="fcc">Food Channels</option>
      <option value="bws">B&amp;W Solution</option>
      {Array.from({ length: 8 }, (_, index) => (
        <option key={index} value={`extra-${index}`}>Extra brand {index + 1}</option>
      ))}
    </FilterableSelect>
  );
}

function ShortExample() {
  return (
    <FilterableSelect aria-label="狀態" defaultValue="active">
      <option value="active">啟用</option>
      <option value="inactive">停用</option>
    </FilterableSelect>
  );
}

describe("FilterableSelect", () => {
  it("keeps lists with ten or fewer options as a normal select", () => {
    render(<ShortExample />);

    expect(screen.getByLabelText("狀態")).toHaveValue("active");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("opens the search inside the dropdown while preserving native select behavior", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    render(<Example />);

    const trigger = screen.getByRole("combobox", { name: "品牌" });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Food Channels" }));
    expect(trigger).toHaveTextContent("Food Channels");

    expect(screen.queryByRole("combobox", { name: "搜尋選項" })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.type(screen.getByRole("combobox", { name: "搜尋選項" }), "Solution");
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "B&W Solution" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "Food Channels" })).not.toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "全部品牌" })).not.toBeInTheDocument();
  });
});
