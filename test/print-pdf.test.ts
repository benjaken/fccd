import { afterEach, describe, expect, it, vi } from "vitest";

import { pdfFilename, printPdf } from "@/lib/print-pdf";

describe("PDF print filenames", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("combines the document type and document number", () => {
    expect(pdfFilename("報價單", "FCLQ20260801")).toBe("報價單FCLQ20260801.pdf");
    expect(pdfFilename("送貨單", "R/202608/6")).toBe("送貨單R-202608-6.pdf");
  });

  it("uses the filename stem as the title while the print dialog opens", () => {
    document.title = "FCCD";
    const print = vi.spyOn(window, "print").mockImplementation(() => {
      expect(document.title).toBe("發票B-1547");
    });

    printPdf("發票", "B-1547");

    expect(print).toHaveBeenCalledOnce();
    expect(document.title).toBe("FCCD");
  });
});
