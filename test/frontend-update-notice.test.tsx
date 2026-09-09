import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FrontendUpdateNotice } from "@/components/FrontendUpdateNotice";
import i18n from "@/i18n";

describe("FrontendUpdateNotice", () => {
  it("shows a refresh prompt when the deployed version changes", async () => {
    await i18n.changeLanguage("zh-HK");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: "build-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: "build-2" }), { status: 200 }));
    const reloadPage = vi.fn();
    const user = userEvent.setup();

    render(
      <FrontendUpdateNotice
        currentVersion="build-1"
        pollIntervalMs={10}
        fetchImpl={fetchImpl}
        reloadPage={reloadPage}
      />,
    );

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText("前端程式已更新")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新整理頁面" }));
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("does not render when the version check fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    render(
      <FrontendUpdateNotice
        currentVersion="build-1"
        enabled
        fetchImpl={fetchImpl}
        pollIntervalMs={10}
      />,
    );

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
