import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { OrderEditorPage } from "@/components/OrderEditorPage";
import { emptyOrderDraft } from "@/lib/order-editor";

const emptyOptions = {
  channels: [],
  shippingMethods: [],
  districts: [],
  salesPartners: [],
  paymentMethods: [],
  catalog: [],
};

function setMobileViewport(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
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

afterEach(() => setMobileViewport(false));

describe("mobile order editor", () => {
  it("keeps the minus sign while entering a refund amount", async () => {
    const user = userEvent.setup();
    const draft = emptyOrderDraft();
    draft.orderNumber = "REFUND-1001";
    draft.payments = [{
      id: "payment-1",
      paymentAt: "2026-09-08T12:00",
      paymentMethodId: "payme",
      amount: 40,
      reference: "",
    }];

    render(
      <MemoryRouter initialEntries={["/orders/order-1/edit"]}>
        <Routes>
          <Route
            path="/orders/:id/edit"
            element={<OrderEditorPage loadEditor={vi.fn().mockResolvedValue({
              draft,
              options: { ...emptyOptions, paymentMethods: [{ id: "payme", name: "PayMe" }] },
            })} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "REFUND-1001" });
    await user.click(document.querySelectorAll<HTMLButtonElement>(".order-editor-steps button")[2]!);
    const amount = screen.getByRole("spinbutton", { name: "金額" });
    await user.clear(amount);
    await user.type(amount, "-40");
    expect(amount).toHaveValue(-40);
  });

  it("requires a manually entered number when copying an order", async () => {
    const draft = emptyOrderDraft();
    const loadEditor = vi.fn().mockResolvedValue({
      draft,
      options: {
        channels: [],
        shippingMethods: [],
        districts: [],
        salesPartners: [],
        paymentMethods: [],
        catalog: [],
      },
    });

    render(
      <MemoryRouter initialEntries={["/orders/new?copyFrom=order-1"]}>
        <Routes>
          <Route path="/orders/new" element={<OrderEditorPage loadEditor={loadEditor} />} />
        </Routes>
      </MemoryRouter>,
    );

    const numberInput = await screen.findByLabelText("單號");
    expect(numberInput).toBeRequired();
    expect(numberInput).not.toBeDisabled();
    await userEvent.setup().type(numberInput, "B-COPIED-1001");
    expect(numberInput).toHaveValue("B-COPIED-1001");
    expect(screen.queryByRole("button", { name: /WATI|闆婚兖/i })).not.toBeInTheDocument();
    expect(loadEditor).toHaveBeenCalledWith("order-1", true);
  });

  it("replaces the wide line-item table with editable item cards", async () => {
    setMobileViewport(true);
    const user = userEvent.setup();
    const draft = emptyOrderDraft();
    draft.orderNumber = "MOBILE-1001";
    draft.lines = [{
      id: "line-1",
      productId: "product-1",
      packageId: null,
      sku: "SKU-1",
      name: "Mobile lunch",
      remarks: "",
      quantity: 2,
      unitPrice: 50,
    }];

    render(
      <MemoryRouter initialEntries={["/orders/order-1/edit"]}>
        <Routes>
          <Route
            path="/orders/:id/edit"
            element={
              <OrderEditorPage
                loadEditor={vi.fn().mockResolvedValue({
                  draft,
                  options: {
                    channels: [],
                    shippingMethods: [],
                    districts: [],
                    salesPartners: [],
                    paymentMethods: [],
                    catalog: [],
                  },
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "MOBILE-1001" });
    const steps = document.querySelectorAll<HTMLButtonElement>(".order-editor-steps button");
    await user.click(steps[1]!);

    await waitFor(() => expect(document.querySelector(".order-editor-mobile-lines")).toBeInTheDocument());
    expect(document.querySelector(".order-editor-table")).not.toBeInTheDocument();
    const itemCard = screen.getByRole("listitem");
    expect(itemCard).toHaveTextContent("Mobile lunch");
    expect(screen.getByRole("spinbutton", { name: "數量" })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: "數量" })).toHaveAttribute("min", "0");
    expect(screen.getByRole("spinbutton", { name: "數量" })).toHaveAttribute("step", "1");
    expect(within(itemCard).getByText("HK$100.00")).toBeInTheDocument();
  });
});
