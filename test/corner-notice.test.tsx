import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CornerNotice } from "@/components/ui/corner-notice";
import i18n from "@/i18n";

describe("CornerNotice", () => {
  afterEach(() => {
    document.querySelector("[data-corner-notice-host]")?.remove();
    vi.useRealTimers();
  });

  it("shows a dismissible status in the top-right host", async () => {
    await i18n.changeLanguage("zh-HK");
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<CornerNotice message="已儲存兌換項目。" onDismiss={onDismiss} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("已儲存兌換項目。");
    expect(status.closest("[data-corner-notice-host]")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "關閉提示" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("dismisses automatically", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<CornerNotice message="已儲存。" onDismiss={onDismiss} durationMs={1000} />);
    vi.advanceTimersByTime(1000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
