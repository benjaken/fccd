import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RESUME_REFRESH_INTERVAL_MS, useResumeRefresh } from "@/lib/use-resume-refresh";

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

describe("useResumeRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("refreshes on an interval while visible", () => {
    const onRefresh = vi.fn();
    renderHook(() => useResumeRefresh(onRefresh));

    vi.advanceTimersByTime(RESUME_REFRESH_INTERVAL_MS - 1);
    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
