import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDeferredFilter } from "@/lib/use-deferred-filter";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("useDeferredFilter", () => {
  it("commits immediately on desktop", () => {
    mockMatchMedia(false);
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ applied }) => useDeferredFilter(applied, commit),
      { initialProps: { applied: "" } },
    );

    act(() => result.current.setValue("Catering"));
    expect(commit).toHaveBeenCalledWith("Catering");
    rerender({ applied: "Catering" });
    expect(result.current.value).toBe("Catering");
  });

  it("holds a mobile draft until confirm", () => {
    mockMatchMedia(true);
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ applied }) => useDeferredFilter(applied, commit),
      { initialProps: { applied: "" } },
    );

    act(() => result.current.setValue("Catering"));
    expect(commit).not.toHaveBeenCalled();
    expect(result.current.value).toBe("Catering");

    act(() => result.current.confirm());
    expect(commit).toHaveBeenCalledWith("Catering");
    rerender({ applied: "Catering" });

    act(() => result.current.setValue("Retail"));
    act(() => result.current.revert());
    expect(result.current.value).toBe("Catering");
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
