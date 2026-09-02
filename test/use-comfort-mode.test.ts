import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useComfortMode } from "@/lib/use-comfort-mode";

describe("useComfortMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts disabled and persists the enabled state", () => {
    const { result } = renderHook(() => useComfortMode());

    expect(result.current.comfortMode).toBe(false);
    expect(window.localStorage.getItem("food-channel-comfort-mode")).toBe("off");

    act(() => result.current.toggleComfortMode());

    expect(result.current.comfortMode).toBe(true);
    expect(window.localStorage.getItem("food-channel-comfort-mode")).toBe("on");
  });

  it("restores the saved preference", () => {
    window.localStorage.setItem("food-channel-comfort-mode", "on");

    const { result } = renderHook(() => useComfortMode());

    expect(result.current.comfortMode).toBe(true);
  });
});
