import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteFilesSidePanel } from "@/components/QuoteFilesSidePanel";
import i18n from "@/i18n";
import type { QuoteFile } from "@/lib/quote-files";
import type { QuoteListItem } from "@/lib/quotes";

const quote: QuoteListItem = {
  id: "quote-1",
  orderNumber: "Q-260812-001",
  customerName: "陳小姐",
  companyName: "示例企業",
  quoteStatus: "跟進中",
  grandTotal: 12880,
  currency: "HKD",
  deliveryAt: null,
  createdAt: "2026-08-12T01:00:00.000Z",
  sourceSystem: null,
};

const historicalFile: QuoteFile = {
  id: "file-1",
  name: "報價版本-1.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  createdAt: "2026-08-20T02:00:00.000Z",
  bucketId: "attachments",
  objectPath: "quotes/quote-1/file-1.pdf",
  available: true,
};

describe("quote file side panel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows the selected quote's historical files", async () => {
    const loadFiles = vi.fn().mockResolvedValue([historicalFile]);
    render(
      <QuoteFilesSidePanel
        quote={quote}
        onClose={vi.fn()}
        loadFiles={loadFiles}
      />,
    );

    expect(await screen.findByText("報價版本-1.pdf")).toBeInTheDocument();
    expect(screen.getByText("歷史文件")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB", { exact: false })).toBeInTheDocument();
    expect(loadFiles).toHaveBeenCalledWith("quote-1");
  });

  it("uploads a file and refreshes the history", async () => {
    const user = userEvent.setup();
    const loadFiles = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([historicalFile]);
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    render(
      <QuoteFilesSidePanel
        quote={quote}
        onClose={vi.fn()}
        loadFiles={loadFiles}
        uploadFile={uploadFile}
      />,
    );

    await screen.findByText("尚未上傳文件");
    const file = new File(["quotation"], "報價版本-1.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("選擇文件"), file);

    await waitFor(() =>
      expect(uploadFile).toHaveBeenCalledWith("quote-1", file),
    );
    expect(await screen.findByText("報價版本-1.pdf")).toBeInTheDocument();
  });

  it("opens an available historical file with a signed URL", async () => {
    const user = userEvent.setup();
    const createFileUrl = vi.fn().mockResolvedValue("https://signed.example/file");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <QuoteFilesSidePanel
        quote={quote}
        onClose={vi.fn()}
        loadFiles={vi.fn().mockResolvedValue([historicalFile])}
        createFileUrl={createFileUrl}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "開啟 報價版本-1.pdf" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://signed.example/file",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    open.mockRestore();
  });
});
