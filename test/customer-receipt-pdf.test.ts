import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assetsReady: false,
  html2canvas: vi.fn(),
  addImage: vi.fn(),
  output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
}));

vi.mock("html2canvas", () => ({ default: mocks.html2canvas }));
vi.mock("jspdf", () => ({
  jsPDF: class {
    addImage = mocks.addImage;
    output = mocks.output;
  },
}));

import { createCustomerReceiptPdf } from "@/lib/customer-receipt-pdf";

describe("customer receipt PDF", () => {
  beforeEach(() => {
    mocks.assetsReady = false;
    mocks.html2canvas.mockReset();
    mocks.addImage.mockClear();
    mocks.output.mockClear();
    mocks.html2canvas.mockImplementation(async (element: HTMLElement) => {
      expect(mocks.assetsReady).toBe(true);
      expect(element.style.transform).toBe("none");
      return {
        width: 794,
        height: 1123,
        toDataURL: () => "data:image/jpeg;base64,receipt",
      };
    });
  });

  it("waits for receipt images to decode before capturing the PDF", async () => {
    const element = document.createElement("div");
    const logo = document.createElement("img");
    Object.defineProperty(logo, "complete", { configurable: true, value: false });
    logo.decode = vi.fn(async () => {
      mocks.assetsReady = true;
    });
    element.appendChild(logo);
    element.style.transform = "scale(0.8)";

    await createCustomerReceiptPdf(element, "P-1146");

    expect(logo.decode).toHaveBeenCalledOnce();
    expect(mocks.html2canvas).toHaveBeenCalledWith(element, expect.any(Object));
    const options = mocks.html2canvas.mock.calls[0]?.[1] as { onclone?: (document: Document, element: HTMLElement) => void };
    const clonedElement = document.createElement("div");
    options.onclone?.(document, clonedElement);
    expect(clonedElement).toHaveClass("is-pdf-capture");
    expect(mocks.addImage).toHaveBeenCalledWith(
      "data:image/jpeg;base64,receipt",
      "JPEG",
      0,
      0,
      210,
      297,
    );
    expect(element.style.transform).toBe("scale(0.8)");
  });
});
