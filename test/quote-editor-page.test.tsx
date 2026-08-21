import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteEditorPage } from "@/components/QuoteEditorPage";
import i18n from "@/i18n";
import { dedupeQuoteOptions, type QuoteEditorOptions, type QuoteLine } from "@/lib/quote-editor";

const options: QuoteEditorOptions = {
  channels: [{ id: "channel-1", name: "Residential" }],
  quoteSalesSources: [{ id: "source-email", name: "Email" }],
  quoteCommunicationChannels: [{ id: "communication-wati", name: "WATI" }],
  districts: [
    { id: "district-1", name: "Central" },
    { id: "district-duplicate", name: "Central" },
  ],
  shippingMethods: [
    { id: "shipping-curb", name: "車邊交收" },
    { id: "shipping-home", name: "送貨上門" },
    { id: "shipping-store", name: "門市自取" },
    { id: "shipping-wine", name: "品酒室 - 外賣盒上" },
    { id: "shipping-office", name: "寫字樓 - 外賣盒上" },
  ],
  salesPartners: [{ id: "partner-1", name: "Amy" }],
  orderTags: [{ id: "tag-1", name: "Birthday" }],
  paymentMethods: [{ id: "payme", name: "PayMe" }],
};

const shippingFeeOptions = [
  { id: "fee-80", item: "Ground-floor delivery", fee: 80, createdAt: "2026-08-21T00:00:00Z" },
  { id: "fee-100", item: "Remote-area delivery", fee: 100, createdAt: "2026-08-21T00:00:00Z" },
];

const emptyQuoteDraft = {
  channelId: "",
  quoteStatus: "",
  quoteSalesSourceId: "",
  quoteCommunicationChannelId: "",
  customerName: "",
  companyName: "",
  contactA: "",
  contactB: "",
  email: "",
  asanaLink: "",
  address: "",
  districtId: "",
  districtName: "",
  shippingMethodId: "",
  deliveryDate: "2026-08-21",
  deliveryTime: "",
  shipOutTime: "",
  customerNote: "",
  packingNote: "",
  salesPartnerId: "",
  internalNote: "",
  tagIds: [],
};

function renderEditor(
  overrides: Partial<ComponentProps<typeof QuoteEditorPage>> = {},
  initialEntry = "/quotes/new",
) {
  const props = {
    loadOptions: vi.fn().mockResolvedValue(options),
    saveQuote: vi.fn().mockResolvedValue({ id: "quote-1", orderNumber: "FCLQ20260801" }),
    loadSummary: vi.fn().mockResolvedValue({ id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1" }),
    loadLines: vi.fn().mockResolvedValue([]),
    searchCatalog: vi.fn().mockResolvedValue([]),
    saveLine: vi.fn().mockResolvedValue(undefined),
    deleteLine: vi.fn().mockResolvedValue(undefined),
    saveDetails: vi.fn().mockResolvedValue(undefined),
    saveExistingLine: vi.fn().mockResolvedValue(undefined),
    saveLineOrder: vi.fn().mockResolvedValue(undefined),
    saveFinancialDetails: vi.fn().mockResolvedValue(undefined),
    saveUtensilLine: vi.fn().mockResolvedValue(undefined),
    loadShippingFeeOptions: vi.fn().mockResolvedValue(shippingFeeOptions),
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/quotes/new" element={<QuoteEditorPage {...props} />} />
        <Route path="/quotes/:id/edit" element={<QuoteEditorPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
  return props;
}

async function fillRequiredQuoteDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/Brand/), "channel-1");
  await user.type(screen.getByLabelText("Customer name"), "BWT Database");
  await user.type(screen.getByLabelText("Company name"), "BWT Limited");
  await user.type(screen.getByLabelText("Contact number"), "94808987");
  await user.type(screen.getByLabelText("Email"), "quote@example.com");
  await user.selectOptions(screen.getByLabelText("Shipping method"), "shipping-home");
  await user.selectOptions(screen.getByLabelText("District"), "district-1");
  await user.selectOptions(screen.getByLabelText("Delivery time"), "12:00 - 13:00");
}

describe("Quote editor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("saves quote details before opening the product step", async () => {
    const user = userEvent.setup();
    const props = renderEditor();

    expect(await screen.findByRole("heading", { name: "New quote" })).toBeInTheDocument();
    await fillRequiredQuoteDetails(user);
    await user.click(screen.getByRole("button", { name: "Save and add products" }));

    await waitFor(() => expect(props.saveQuote).toHaveBeenCalledWith(expect.objectContaining({
      channelId: "channel-1",
      customerName: "BWT Database",
    })));
    expect(await screen.findByRole("heading", { name: "FCLQ20260801" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add product" })).toBeInTheDocument();
    expect(screen.getByText("The quote is saved. You can now start adding products.")).toBeInTheDocument();
  });

  it("copies quote data into a new quote while clearing delivery and dispatch times", async () => {
    const user = userEvent.setup();
    const sourceLine: QuoteLine = {
      id: "source-line-1",
      productId: "product-1",
      packageId: null,
      sku: "P001",
      name: "Roast pork",
      quantity: 2,
      unitPrice: 88,
      totalPrice: 176,
      remarks: "No onions",
    };
    const sourceDraft = {
      ...emptyQuoteDraft,
      channelId: "channel-1",
      customerName: "Copied customer",
      companyName: "Copied company",
      contactA: "94808987",
      email: "copied@example.com",
      districtId: "district-1",
      shippingMethodId: "shipping-home",
      deliveryTime: "12:00 - 13:00",
      shipOutTime: "11:15",
    };
    const loadSummary = vi.fn().mockResolvedValue({
      id: "source-quote",
      orderNumber: "FCLQ20260701",
      channelId: "channel-1",
      draft: sourceDraft,
      financials: {
        shippingFee: 80,
        discount: 20,
        cashdollarRedeemed: 0,
        cashdollarPurchased: 0,
      },
      payments: [],
    });
    const loadLines = vi.fn().mockResolvedValue([sourceLine]);
    const saveQuote = vi.fn().mockResolvedValue({
      id: "copied-quote",
      orderNumber: "FCLQ20260802",
    });
    const copyQuote = vi.fn().mockResolvedValue({
      id: "copied-quote",
      orderNumber: "FCLQ20260802",
    });

    renderEditor(
      { loadSummary, loadLines, saveQuote, copyQuote },
      "/quotes/new?copyFrom=source-quote",
    );

    expect(await screen.findByLabelText("Customer name")).toHaveValue(
      "Copied customer",
    );
    expect(loadSummary).toHaveBeenCalledWith("source-quote");
    expect(loadLines).toHaveBeenCalledWith("source-quote");
    expect(screen.getByLabelText("Delivery time")).toHaveValue("");
    expect(screen.getByLabelText("Dispatch time")).toHaveValue("");

    await user.selectOptions(
      screen.getByLabelText("Delivery time"),
      "13:00 - 14:00",
    );
    await user.click(
      screen.getByRole("button", { name: "Save and add products" }),
    );

    await waitFor(() =>
      expect(copyQuote).toHaveBeenCalledWith(
        "source-quote",
        expect.objectContaining({
          customerName: "Copied customer",
          deliveryTime: "13:00 - 14:00",
          shipOutTime: "",
        }),
      ),
    );
    expect(saveQuote).not.toHaveBeenCalled();
  });

  it("searches and adds a product to the saved quote", async () => {
    const user = userEvent.setup();
    const lines: QuoteLine[] = [{
      id: "line-1", productId: "product-1", packageId: null, sku: "P001",
      name: "Roast pork", quantity: 2, unitPrice: 88, totalPrice: 176, remarks: null,
    }];
    const loadLines = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(lines);
    const searchCatalog = vi.fn().mockResolvedValue([
      { id: "product-1", kind: "product", sku: "P001", name: "Roast pork", price: 88 },
    ]);
    const saveLine = vi.fn().mockResolvedValue(undefined);

    const props = renderEditor({ loadLines, searchCatalog, saveLine });
    await screen.findByLabelText(/Brand/);
    await fillRequiredQuoteDetails(user);
    await user.click(screen.getByRole("button", { name: "Save and add products" }));

    const search = await screen.findByPlaceholderText("Search product name or SKU");
    await user.type(search, "P001");
    await user.click(await screen.findByRole("option", { name: /Roast pork/ }));
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "2");
    await user.click(screen.getByRole("button", { name: "Add to quote" }));

    await waitFor(() => expect(props.saveLine).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "quote-1", quantity: 2, unitPrice: 88,
    })));
    expect((await screen.findAllByText("HK$176.00")).length).toBeGreaterThanOrEqual(1);
  });

  it("applies shipping rules and selectable delivery times", async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByRole("heading", { name: "New quote" });
    expect(screen.queryByLabelText("Delivery address")).not.toBeInTheDocument();

    const shippingMethod = screen.getByLabelText("Shipping method");
    await user.selectOptions(shippingMethod, "shipping-home");
    expect(screen.getByLabelText("Delivery address")).toBeInTheDocument();

    await user.selectOptions(shippingMethod, "shipping-store");
    expect(screen.queryByLabelText("Delivery address")).not.toBeInTheDocument();
    expect(screen.getByLabelText("District")).toHaveDisplayValue("門市自取");
    expect(screen.getByLabelText("District")).toBeDisabled();

    const deliveryTime = screen.getByLabelText("Delivery time");
    expect(deliveryTime).toHaveDisplayValue("Delivery time");
    await user.selectOptions(deliveryTime, "12:00 - 13:00");
    expect(deliveryTime).toHaveValue("12:00 - 13:00");
    await user.selectOptions(deliveryTime, "custom");
    expect(screen.getByPlaceholderText("Enter a custom delivery time")).toBeInTheDocument();

    const shipOutTime = screen.getByLabelText("Dispatch time");
    expect(shipOutTime).toHaveDisplayValue("Dispatch time");
    expect(screen.getByRole("option", { name: "08:30" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "13:15" })).toBeInTheDocument();
  });

  it("removes duplicate districts by normalized name", () => {
    expect(dedupeQuoteOptions(options.districts)).toEqual([
      { id: "district-1", name: "Central" },
    ]);
  });

  it("selects multiple order tags from a searchable dropdown", async () => {
    const user = userEvent.setup();
    renderEditor();

    const tags = await screen.findByRole("combobox", { name: "Order tags" });
    expect(tags).toHaveTextContent("Choose order tags");
    expect(tags.closest(".quote-editor-form-column")).toBe(
      screen.getByText("Asana Link").closest(".quote-editor-form-column"),
    );
    await user.click(tags);
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
    await user.click(screen.getByRole("option", { name: "Birthday" }));
    expect(tags).toHaveTextContent("Birthday");
    expect(screen.getByRole("option", { name: "Birthday" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the order-tag placeholder when editing a quote without tags", async () => {
    const summary = {
      id: "quote-1",
      orderNumber: "FCLQ20260801",
      channelId: "channel-1",
      draft: {
        ...emptyQuoteDraft,
        channelId: "channel-1",
      },
    };

    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    const tags = await screen.findByRole("combobox", { name: "Order tags" });
    expect(tags).toHaveTextContent("Choose order tags");
    expect(tags).toHaveAttribute("aria-placeholder", "Choose order tags");
  });

  it("edits and saves the three legacy quote workflow statuses", async () => {
    const user = userEvent.setup();
    const saveDetails = vi.fn().mockResolvedValue(undefined);
    const summary = {
      id: "quote-1",
      orderNumber: "FCLQ20260801",
      channelId: "channel-1",
      draft: {
        ...emptyQuoteDraft,
        channelId: "channel-1",
        customerName: "Customer",
        companyName: "Company",
        contactA: "12345678",
        email: "quote@example.com",
        districtId: "district-1",
        shippingMethodId: "shipping-home",
        deliveryTime: "12:00 - 13:00",
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };

    renderEditor(
      { loadSummary: vi.fn().mockResolvedValue(summary), saveDetails },
      "/quotes/quote-1/edit",
    );

    await user.selectOptions(await screen.findByLabelText("Success probability"), "High Chance");
    await user.selectOptions(screen.getByLabelText("Sales source"), "source-email");
    await user.selectOptions(screen.getByLabelText("Communication channel"), "communication-wati");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveDetails).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        quoteStatus: "High Chance",
        quoteSalesSourceId: "source-email",
        quoteCommunicationChannelId: "communication-wati",
      }),
    ));
  });

  it("shows two tabs and edits existing product details with a collapsed 16-character remark", async () => {
    const user = userEvent.setup();
    const line: QuoteLine = {
      id: "line-1",
      productId: "product-1",
      packageId: null,
      sku: "P001",
      name: "Roast pork",
      quantity: 2,
      unitPrice: 88,
      totalPrice: 176,
      remarks: "Original remark",
    };
    const saveExistingLine = vi.fn().mockResolvedValue(undefined);
    const summary = {
      id: "quote-1",
      orderNumber: "FCLQ20260801",
      channelId: "channel-1",
      draft: {
        channelId: "channel-1",
        customerName: "Customer",
        companyName: "",
        contactA: "",
        contactB: "",
        email: "",
        asanaLink: "",
        address: "",
        districtId: "",
        districtName: "",
        shippingMethodId: "",
        deliveryDate: "2026-08-21",
        deliveryTime: "",
        shipOutTime: "",
        customerNote: "",
        packingNote: "",
        salesPartnerId: "",
        internalNote: "",
        tagIds: [],
      },
    };

    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([line])} saveExistingLine={saveExistingLine} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    const tabs = await screen.findAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await user.click(tabs[1]);
    expect(screen.getByLabelText("Brand")).toHaveValue("channel-1");
    expect(screen.queryByRole("textbox", { name: "Remarks Roast pork" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Original remark/ }));
    expect(screen.getByRole("textbox", { name: "Remarks Roast pork" })).toHaveAttribute("maxlength", "16");

    const quantityInput = screen.getByRole("spinbutton", { name: "Quantity Roast pork" });
    fireEvent.change(quantityInput, { target: { value: "3" } });
    fireEvent.blur(quantityInput);
    await waitFor(() => expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({ id: "line-1", quantity: 3 })));
  });

  it("shows sequence and SKU columns and saves a dragged product order", async () => {
    const user = userEvent.setup();
    const saveLineOrder = vi.fn().mockResolvedValue(undefined);
    const lines: QuoteLine[] = [
      {
        id: "line-1", productId: "product-1", packageId: null, sku: "P001",
        name: "Roast pork", quantity: 2, unitPrice: 88, totalPrice: 176, remarks: null,
      },
      {
        id: "line-2", productId: "product-2", packageId: null, sku: "P002",
        name: "Beef", quantity: 1, unitPrice: 68, totalPrice: 68, remarks: null,
      },
    ];
    const summary = {
      id: "quote-1",
      orderNumber: "FCLQ20260801",
      channelId: "channel-1",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
      },
    };

    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue(lines)} saveLineOrder={saveLineOrder} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    const tabs = await screen.findAllByRole("tab");
    await user.click(tabs[1]);
    expect(screen.getByRole("columnheader", { name: "No." })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "SKU" })).toBeInTheDocument();
    expect(screen.getByText("P001")).toBeInTheDocument();

    const dragHandle = screen.getByRole("button", { name: "Drag to reorder item 2 Beef" });
    const targetRow = screen.getByText("Roast pork").closest("tr");
    expect(targetRow).not.toBeNull();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(),
    };
    fireEvent.dragStart(dragHandle, { dataTransfer });
    fireEvent.dragOver(targetRow!, { dataTransfer });
    fireEvent.drop(targetRow!, { dataTransfer });

    await waitFor(() => expect(saveLineOrder).toHaveBeenCalledWith(["line-2", "line-1"]));
    expect(screen.getByRole("button", { name: "Drag to reorder item 1 Beef" })).toBeInTheDocument();
  });

  it("auto-saves quote amount adjustments and adds a utensil line", async () => {
    const user = userEvent.setup();
    const saveFinancialDetails = vi.fn().mockResolvedValue(undefined);
    const saveUtensilLine = vi.fn().mockResolvedValue(undefined);
    const loadLines = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "utensil-1", productId: null, packageId: null, sku: null,
        name: "餐具包", quantity: 1, unitPrice: 0, totalPrice: 0, remarks: null,
      }]);
    const summary = {
      id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
      },
      financials: { shippingFee: 80, discount: 20, cashdollarRedeemed: 10, cashdollarPurchased: 30 },
    };

    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={loadLines} saveFinancialDetails={saveFinancialDetails} saveUtensilLine={saveUtensilLine} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    const tabs = await screen.findAllByRole("tab");
    await user.click(tabs[1]);
    const shippingFee = screen.getByRole("combobox", { name: "Shipping fee option" });
    expect(shippingFee).toHaveValue("fee-80");
    await user.selectOptions(shippingFee, "fee-100");
    await waitFor(() => expect(saveFinancialDetails).toHaveBeenCalledWith("quote-1", {
      shippingFee: 100,
      discount: 20,
      cashdollarRedeemed: 10,
      cashdollarPurchased: 30,
    }));
    const shippingFeeAmount = screen.getByRole("spinbutton", { name: "Shipping fee amount" });
    await user.clear(shippingFeeAmount);
    await user.type(shippingFeeAmount, "110");
    await user.tab();
    await waitFor(() => expect(saveFinancialDetails).toHaveBeenLastCalledWith("quote-1", {
      shippingFee: 110,
      discount: 20,
      cashdollarRedeemed: 10,
      cashdollarPurchased: 30,
    }));

    await user.click(screen.getByRole("button", { name: "Add utensil pack" }));
    await waitFor(() => expect(saveUtensilLine).toHaveBeenCalledWith("quote-1"));
    expect(await screen.findByText("餐具包")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Utensil pack added" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "View quote" })).not.toBeInTheDocument();
    expect(screen.queryByText("PDF 內容")).not.toBeInTheDocument();
  });

  it("shows an optional third payment step and completes without a payment", async () => {
    const user = userEvent.setup();
    const saveDetails = vi.fn().mockResolvedValue(undefined);
    const saveFinancialDetails = vi.fn().mockResolvedValue(undefined);
    const savePayments = vi.fn().mockResolvedValue(undefined);
    const sendConfirmation = vi.fn().mockResolvedValue(undefined);
    const summary = {
      id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };

    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([])} saveDetails={saveDetails} saveFinancialDetails={saveFinancialDetails} savePayments={savePayments} sendConfirmation={sendConfirmation} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
          <Route path="/quotes" element={<div>Quotes list</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const tabs = await screen.findAllByRole("tab");
    expect(tabs).toHaveLength(3);
    await user.click(tabs[2]);
    expect(screen.getByRole("heading", { name: "Payment records" })).toBeInTheDocument();
    expect(screen.queryByText("Payment records are optional and can be added later.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Complete" }));

    await waitFor(() => expect(savePayments).toHaveBeenCalledWith("quote-1", "FCLQ20260801", "channel-1", []));
    expect(saveDetails).toHaveBeenCalled();
    expect(saveFinancialDetails).toHaveBeenCalled();
    expect(sendConfirmation).not.toHaveBeenCalled();
    expect(await screen.findByText("Quotes list")).toBeInTheDocument();
  });

  it("only sends notifications from the explicit WATI and email action", async () => {
    const user = userEvent.setup();
    const sendConfirmation = vi.fn().mockResolvedValue(undefined);
    const summary = {
      id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([])} saveDetails={vi.fn().mockResolvedValue(undefined)} saveFinancialDetails={vi.fn().mockResolvedValue(undefined)} savePayments={vi.fn().mockResolvedValue(undefined)} sendConfirmation={sendConfirmation} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
          <Route path="/quotes" element={<div>Quotes list</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const tabs = await screen.findAllByRole("tab");
    await user.click(tabs[2]);
    expect(sendConfirmation).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send WATI and email confirmation" }));
    await waitFor(() => expect(sendConfirmation).toHaveBeenCalledWith("quote-1"));
  });

  it("places convert to order on the first quote step instead of the list", async () => {
    const user = userEvent.setup();
    const convertQuote = vi.fn().mockResolvedValue({ id: "order-1", orderNumber: "FCLO20260801" });
    const summary = {
      id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([])} saveDetails={vi.fn().mockResolvedValue(undefined)} saveFinancialDetails={vi.fn().mockResolvedValue(undefined)} convertQuote={convertQuote} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
          <Route path="/orders/:id" element={<div>Converted order</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "FCLQ20260801" });
    await user.click(screen.getByRole("button", { name: "Convert to order" }));
    await waitFor(() => expect(convertQuote).toHaveBeenCalledWith("quote-1"));
    expect(await screen.findByText("Converted order")).toBeInTheDocument();
  });

  it("shows all three editor sections together on the quote detail page without tabs", async () => {
    const summary = {
      id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: ["tag-1"],
        quoteStatus: "High Chance", quoteSalesSourceId: "source-email", quoteCommunicationChannelId: "communication-wati",
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteEditorPage combined readOnly loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "FCLQ20260801" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customer details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add product" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payment records" })).toBeInTheDocument();
    expect(screen.getByText("Birthday")).toBeInTheDocument();
    expect(screen.getByText("High Chance")).toBeInTheDocument();
    expect(screen.getAllByText("Email").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("WATI")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "額外資訊" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "活動項目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector("input, select, textarea")).not.toBeInTheDocument();
  });
});
