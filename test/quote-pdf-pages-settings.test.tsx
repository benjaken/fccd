import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePdfPagesSettingsPage } from "@/components/QuotePdfPagesSettingsPage";
import i18n from "@/i18n";
import type { QuotePdfPage } from "@/lib/quote-pdf-pages";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({
    isSuperAdmin: true,
    loading: false,
    error: null,
    canAccess: () => true,
    canManage: () => true,
    canAccessSection: () => true,
  }),
}));

const pageItem: QuotePdfPage = {
  id: "page-1",
  channelId: "brand-1",
  channelName: "HK Lunch Box",
  placement: "front",
  title: "公司簡介",
  objectPath: "brand-1/page-1.png",
  originalFilename: "intro.png",
  mimeType: "image/png",
  sizeBytes: 1024,
  sortOrder: 1,
  isActive: true,
  previewUrl: "https://example.com/intro.png",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

describe("quote PDF cover and back page settings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("uses the shared table and paginates pages across all brands", async () => {
    const user = userEvent.setup();
    const loadPages = vi.fn().mockImplementation(({ page }: { page: number }) =>
      Promise.resolve({ items: page === 1 ? [pageItem] : [], total: 16 }),
    );

    render(
      <MemoryRouter>
        <QuotePdfPagesSettingsPage
          loadBrands={vi.fn().mockResolvedValue([{ id: "brand-1", name: "HK Lunch Box" }])}
          loadPages={loadPages}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "封面封底設定" })).toBeInTheDocument();
    expect(await screen.findByText("公司簡介")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "品牌" })).not.toBeInTheDocument();
    expect(loadPages).toHaveBeenCalledWith({ page: 1, placement: "" });

    await user.click(screen.getByRole("button", { name: "下一頁" }));
    await waitFor(() => expect(loadPages).toHaveBeenLastCalledWith({ page: 2, placement: "" }));
  });

  it("requires an A4 image when adding a new page", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuotePdfPagesSettingsPage
          loadBrands={vi.fn().mockResolvedValue([{ id: "brand-1", name: "HK Lunch Box" }])}
          loadPages={vi.fn().mockResolvedValue({ items: [], total: 0 })}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "新增頁面" }));
    await user.type(screen.getByLabelText("頁面名稱"), "公司簡介");
    await user.click(screen.getByRole("button", { name: "儲存" }));
    expect(screen.getByRole("alert")).toHaveTextContent("請選擇頁面圖片");
  });
});
