import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreparedMeatItemSearchSelect } from "@/components/prepared-meat-line-controls";
import { RawMeatTagPicker } from "@/components/RawMeatTagPicker";

describe("blur timer cleanup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels the prepared-meat picker timer when unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <PreparedMeatItemSearchSelect
        label="熟肉商品"
        placeholder="搜尋商品"
        value=""
        options={[{ id: "prepared-1", name: "牛肉丸" }]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "熟肉商品" });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the raw-meat picker timer when unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <RawMeatTagPicker
        label="供應商"
        placeholder="搜尋供應商"
        values={[]}
        options={[{ id: "supplier-1", name: "供應商 A" }]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "供應商" });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
