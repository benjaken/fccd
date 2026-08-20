import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FactoryMeatDeliveryNotePage } from "@/components/FactoryMeatDeliveryNotePage";
import i18n from "@/i18n";

describe("FactoryMeatDeliveryNotePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("uses an A4 portrait preview and portrait print page", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-sheet\s*\{[^}]*width:\s*min\(794px,[^}]*min-height:\s*1123px/s,
    );
    expect(stylesheet).toMatch(
      /@page factory-meat-delivery-note\s*\{[^}]*size:\s*A4 portrait/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-sheet\s*\{[^}]*page:\s*factory-meat-delivery-note/s,
    );
    expect(stylesheet).not.toMatch(/size:\s*A4 landscape/);
    expect(stylesheet).toMatch(
      /\.factory-meat-note-lines tbody tr:last-child td\s*\{[^}]*border-bottom:\s*2px solid #000000 !important/s,
    );
    expect(stylesheet).toMatch(
      /\.factory-meat-note-details \.factory-meat-note-order-number\s*\{[^}]*border-bottom:\s*2px solid #000000/s,
    );
  });

  it("renders the meat delivery note and opens portrait printing", async () => {
    const user = userEvent.setup();
    const markPrinted = vi.fn(async () => {});
    const print = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/factory/meat-delivery-note/meat-1"]}>
        <Routes>
          <Route
            path="/factory/meat-delivery-note/:meatOrderId"
            element={
              <FactoryMeatDeliveryNotePage
                loadNote={async () => ({
                  id: "meat-1",
                  customerId: "customer-1",
                  customerName: "桂花小幸 TKO",
                  shippingMethodId: "method-1",
                  shippingMethodName: "三皇物流",
                  orderNumber: "R - 202608 - 6",
                  shippingAt: "2026-08-13T16:00:00.000Z",
                  remarks: "",
                  sendToFactory: true,
                  contactPerson: "李振聲",
                  phone: "9742 3619",
                  address: "將軍澳唐德街1號將軍澳廣場1樓133-135號舖",
                  lines: [
                    {
                      kind: "prepared",
                      itemId: "item-1",
                      sku: null,
                      name: "熟滷水牛展片",
                      unit: "份",
                      quantity: 4,
                      remarks: "",
                    },
                  ],
                })}
                markPrinted={markPrinted}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "送貨單" })).toBeInTheDocument();
    expect(screen.getByText("桂花小幸 TKO")).toBeInTheDocument();
    expect(screen.getByText(/R - 202608 - 6/)).toHaveClass(
      "factory-meat-note-order-number",
    );
    expect(screen.getByText("三皇物流")).toBeInTheDocument();
    expect(screen.getByText("熟滷水牛展片")).toBeInTheDocument();
    expect(screen.getByText("4份")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /列印/ }));
    expect(markPrinted).toHaveBeenCalledWith("meat-1");
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
