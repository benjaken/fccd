import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useResumeRefresh } from "@/lib/use-resume-refresh";

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

describe("useResumeRefresh", () => {
  afterEach(() => {
    setVisibility("visible");
  });

  it("does not refresh on mount", () => {
    const onRefresh = vi.fn();
    renderHook(() => useResumeRefresh(onRefresh));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("refreshes when the document becomes visible", () => {
    const onRefresh = vi.fn();
    renderHook(() => useResumeRefresh(onRefresh));

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while the document is hidden", () => {
    const onRefresh = vi.fn();
    renderHook(() => useResumeRefresh(onRefresh));

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("coalesces visibilitychange and pageshow that fire together", () => {
    const onRefresh = vi.fn();
    renderHook(() => useResumeRefresh(onRefresh));

    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
