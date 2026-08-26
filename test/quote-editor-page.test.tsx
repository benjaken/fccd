import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dictionaryValues = vi.hoisted(() => ({
  delivery_time_slot: ["12:00 - 13:00", "13:00 - 14:00", "17:00 - 18:00"],
  ship_out_time_slot: ["08:30", "11:30", "12:00", "13:15"],
  quote_status: ["Low Chance", "High Chance", "Done Deal", "Case Closed"],
}));

vi.mock("@/lib/dictionaries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dictionaries")>();
  return {
    ...actual,
    useDictItems: (typeCode: string) => ({
      items: (dictionaryValues[typeCode as keyof typeof dictionaryValues] ?? []).map((value, index) => ({
        id: `${typeCode}-${index}`,
        dictTypeId: typeCode,
        value,
        label: value,
        labelEn: null,
        description: "",
        metadata: {},
        sortOrder: index,
        isActive: true,
      })),
      loading: false,
      error: null,
      reload: vi.fn(),
    }),
  };
});

import { QuoteEditorPage } from "@/components/QuoteEditorPage";
import i18n from "@/i18n";
import { dedupeQuoteOptions, quoteLineTotal, quoteWorkflowValues, type QuoteEditorOptions, type QuoteLine } from "@/lib/quote-editor";
import type { ProductListItem } from "@/lib/products";

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
  orderTags: [
    { id: "tag-1", name: "Birthday" },
    { id: "tag-2", name: "VIP" },
  ],
  paymentMethods: [{ id: "payme", name: "PayMe" }],
};

const shippingFeeOptions = [
  { id: "fee-free", item: "Free delivery", fee: 0, createdAt: "2026-08-21T00:00:00Z" },
  { id: "fee-80", item: "Ground-floor delivery", fee: 80, createdAt: "2026-08-21T00:00:00Z" },
  { id: "fee-100", item: "Remote-area delivery", fee: 100, createdAt: "2026-08-21T00:00:00Z" },
];

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

describe("quote line totals", () => {
  it("recalculates migrated rows whose stored subtotal is zero", () => {
    expect(quoteLineTotal(24, 88, 0)).toBe(2112);
    expect(quoteLineTotal(2, 88, 176)).toBe(176);
  });
});

const emptyQuoteDraft = {
  channelId: "",
  quoteStatus: "",
  quoteSalesSourceId: "",
  quoteCommunicationChannelId: "",
  followUpDate: "",
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

describe("quote workflow fields", () => {
  it("persists the selected follow-up date and clears an empty date", () => {
    expect(quoteWorkflowValues({ ...emptyQuoteDraft, followUpDate: "2026-08-24" }))
      .toMatchObject({ quote_follow_up_date: "2026-08-24" });
    expect(quoteWorkflowValues(emptyQuoteDraft))
      .toMatchObject({ quote_follow_up_date: null });
  });
});

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
    loadPackageDetail: vi.fn().mockResolvedValue(null),
    deleteLine: vi.fn().mockResolvedValue(undefined),
    saveDetails: vi.fn().mockResolvedValue(undefined),
    saveExistingLine: vi.fn().mockResolvedValue(undefined),
    saveLineOrder: vi.fn().mockResolvedValue(undefined),
    saveFinancialDetails: vi.fn().mockResolvedValue(undefined),
    savePayments: vi.fn().mockResolvedValue(undefined),
    saveUtensilLine: vi.fn().mockResolvedValue(undefined),
    saveFactorySettings: vi.fn().mockResolvedValue(undefined),
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
  await user.type(screen.getByLabelText("Contact number"), "94808987");
  await user.type(screen.getByLabelText("Email"), "quote@example.com");
  await user.selectOptions(screen.getByLabelText("Shipping method"), "shipping-home");
  await user.click(screen.getByRole("combobox", { name: "District" }));
  await user.click(screen.getByRole("option", { name: "Central" }));
}

describe("Quote editor", () => {
  beforeEach(async () => {
    setMobileViewport(false);
    await i18n.changeLanguage("en");
  });

  it("renders editable product cards instead of the wide table on mobile", async () => {
    setMobileViewport(true);
    const line: QuoteLine = {
      id: "line-mobile",
      productId: "product-1",
      packageId: null,
      sku: "MOBILE-1",
      name: "Mobile banquet",
      quantity: 2,
      unitPrice: 80,
      totalPrice: 160,
      remarks: "No nuts",
    };
    renderEditor({
      loadSummary: vi.fn().mockResolvedValue({
        id: "quote-1",
        orderNumber: "FCLQ-MOBILE",
        channelId: "channel-1",
      }),
      loadLines: vi.fn().mockResolvedValue([line]),
    }, "/quotes/quote-1/edit");

    const mobileList = await waitFor(() => {
      const node = document.querySelector<HTMLElement>(".quote-mobile-lines");
      expect(node).toBeInTheDocument();
      return node!;
    });
    expect(within(mobileList).getByRole("listitem")).toHaveTextContent("Mobile banquet");
    expect(document.querySelector(".quote-lines-panel table")).not.toBeInTheDocument();
    expect(within(mobileList).getByRole("spinbutton", { name: "Quantity" })).toHaveValue(2);
  });

  it("saves quote details before opening the product step", async () => {
    const user = userEvent.setup();
    const props = renderEditor();

    expect(await screen.findByRole("heading", { name: "New quote" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tablist")).toHaveClass("is-quote");
    expect(screen.queryByRole("heading", { name: "Payment records" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Customer note/)).toBeInTheDocument();
    expect(screen.getByText("Shown on delivery note")).toBeInTheDocument();
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

  it("copies quote data into a new quote while clearing follow-up, delivery and dispatch times", async () => {
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
      followUpDate: "2026-08-24",
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
    expect(screen.getByLabelText("Follow-up date")).toHaveValue("");

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
          followUpDate: "",
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

    expect(props.saveLine).not.toHaveBeenCalled();
    expect((await screen.findAllByText("HK$176.00")).length).toBeGreaterThanOrEqual(1);

    const stagedQuantity = screen.getByRole("spinbutton", { name: "Quantity Roast pork" });
    await user.clear(stagedQuantity);
    await user.type(stagedQuantity, "3");
    await user.tab();
    expect(props.saveExistingLine).not.toHaveBeenCalled();

    await user.click(within(document.getElementById("quote-editor-editable-items")!).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(props.saveLine).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "quote-1", quantity: 3, unitPrice: 88,
    })));
  }, 10_000);

  it("adds a custom product to the local draft before saving the quote", async () => {
    const user = userEvent.setup();
    const saveLine = vi.fn().mockResolvedValue(undefined);

    renderEditor({ saveLine });
    await screen.findByLabelText(/Brand/);
    await fillRequiredQuoteDetails(user);
    await user.click(screen.getByRole("button", { name: "Save and add products" }));

    await user.click(screen.getByRole("button", { name: "Custom product" }));
    const dialog = await screen.findByRole("dialog", { name: "Custom product" });
    const addButton = within(dialog).getByRole("button", { name: "Add" });
    expect(addButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Product name"), "Special banquet item");
    await user.type(within(dialog).getByLabelText("Unit price"), "320");
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    const customRow = await screen.findByRole("row", { name: /Special banquet item/ });
    expect(within(customRow).getByText("HK$320.00")).toBeInTheDocument();
    expect(saveLine).not.toHaveBeenCalled();

    await user.click(within(document.getElementById("quote-editor-editable-items")!).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveLine).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "quote-1",
      item: expect.objectContaining({ kind: "custom", name: "Special banquet item" }),
      quantity: 1,
      unitPrice: 320,
    })));
  }, 10_000);

  it("selects multiple lunch box products from the side panel and stages each as a separate line", async () => {
    const user = userEvent.setup();
    const lunchbox = (overrides: Partial<ProductListItem>): ProductListItem => ({
      id: "lunchbox-1",
      sku: "CBE001",
      name: "Chicken rice",
      chineseName: "香草雞飯",
      price: 68,
      priceMin: 60,
      priceMax: 80,
      status: "active",
      isActive: true,
      isBentoRecommended: false,
      channelId: "channel-1",
      channelName: "Residential",
      productTypeId: null,
      productTypeName: null,
      cookTypeId: null,
      cookTypeName: "Roasted",
      bentoMainTypeId: null,
      bentoMainTypeName: "Rice",
      bentoColumnTypeId: null,
      bentoColumnTypeName: "Two compartments",
      mainIngredients: ["Chicken"],
      specialRequests: ["No nuts"],
      createdAt: "2026-08-24T00:00:00Z",
      ...overrides,
    });
    const recommended = lunchbox({ isBentoRecommended: true });
    const more = lunchbox({ id: "lunchbox-2", sku: "CBE002", chineseName: "魚香茄子飯", name: "Eggplant rice", price: 72 });
    const loadLunchboxProducts = vi.fn().mockImplementation(async (filters: { recommended?: boolean; productIds?: string[] }) => {
      if (filters.productIds) {
        const selectedItems = [recommended, more].filter((item) => filters.productIds?.includes(item.id));
        return { items: selectedItems, total: selectedItems.length };
      }
      return { items: filters.recommended ? [recommended] : [more], total: 1 };
    });
    const saveLine = vi.fn().mockResolvedValue(undefined);

    renderEditor({
      saveLine,
      loadLunchboxProducts,
      loadLunchboxFilterOptions: vi.fn().mockResolvedValue({
        staples: [],
        compartments: [],
        cookTypes: [],
        mainIngredients: [],
        specialRequests: [],
      }),
    });
    await screen.findByLabelText(/Brand/);
    await fillRequiredQuoteDetails(user);
    await user.click(screen.getByRole("button", { name: "Save and add products" }));
    await user.click(await screen.findByRole("button", { name: "Search lunch box products" }));

    const panel = await screen.findByRole("dialog", { name: "Choose lunch box products" });
    expect(within(panel).getByRole("heading", { name: "Selected" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Recommended" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "More products" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Select Chicken rice" }));
    await user.click(within(panel).getByRole("button", { name: "Select Eggplant rice" }));
    await user.click(within(panel).getByRole("button", { name: "Confirm and add 2 items" }));

    expect(await screen.findByRole("row", { name: /CBE001 Chicken rice/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /CBE002 Eggplant rice/ })).toBeInTheDocument();
    expect(saveLine).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Search lunch box products" }));
    const reopenedPanel = await screen.findByRole("dialog", { name: "Choose lunch box products" });
    expect(within(reopenedPanel).getByText("2", { selector: ".lunchbox-picker-column-heading span" })).toBeInTheDocument();
    expect(within(reopenedPanel).getByRole("button", { name: "Unselect Chicken rice" })).toHaveAttribute("aria-pressed", "true");
    expect(within(reopenedPanel).getByRole("button", { name: "Unselect Eggplant rice" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(reopenedPanel).getByRole("button", { name: "Cancel" }));

    await user.click(within(document.getElementById("quote-editor-editable-items")!).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveLine).toHaveBeenCalledTimes(2));
    expect(saveLine).toHaveBeenCalledWith(expect.objectContaining({
      item: expect.objectContaining({ id: "lunchbox-1", kind: "product" }),
      quantity: 1,
      unitPrice: 68,
    }));
    expect(saveLine).toHaveBeenCalledWith(expect.objectContaining({
      item: expect.objectContaining({ id: "lunchbox-2", kind: "product" }),
      quantity: 1,
      unitPrice: 72,
    }));
  }, 10_000);

  it("requires package dish selections before adding a package", async () => {
    const user = userEvent.setup();
    const searchCatalog = vi.fn().mockResolvedValue([
      { id: "package-1", kind: "package", sku: "SET-1", name: "Family Feast", price: 680 },
    ]);
    const loadPackageDetail = vi.fn().mockResolvedValue({
      id: "package-1",
      choiceSets: [{
        id: "choice-set-1",
        legacyId: "legacy-choice-set-1",
        name: "Main dishes",
        maximumChoices: 2,
        products: [
          { id: "member-1", productId: "product-1", productSku: "D-1", productName: "Roast chicken", productChineseName: null, addonPrice: 0, isSelected: false },
          { id: "member-2", productId: "product-2", productSku: "D-2", productName: "Steamed fish", productChineseName: null, addonPrice: 10, isSelected: false },
          { id: "member-3", productId: "product-3", productSku: "D-3", productName: "Braised tofu", productChineseName: null, addonPrice: 0, isSelected: false },
        ],
      }],
      ungroupedProducts: [],
    });
    const saveLine = vi.fn().mockResolvedValue(undefined);

    renderEditor({ searchCatalog, loadPackageDetail, saveLine });
    await screen.findByLabelText(/Brand/);
    await fillRequiredQuoteDetails(user);
    await user.click(screen.getByRole("button", { name: "Save and add products" }));

    await user.type(await screen.findByPlaceholderText("Search product name or SKU"), "SET-1");
    await user.click(await screen.findByRole("option", { name: /Family Feast/ }));
    await user.click(screen.getByRole("button", { name: "Add to quote" }));

    const dialog = await screen.findByRole("dialog", { name: "Choose package dishes" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm and add" });
    expect(saveLine).not.toHaveBeenCalled();
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: /Roast chicken/ }));
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /Steamed fish/ }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(saveLine).not.toHaveBeenCalled();
    const packageRow = await screen.findByRole("row", { name: /Family Feast/ });
    expect(within(packageRow).queryByText("Main dishes")).not.toBeInTheDocument();
    expect(within(packageRow).queryByText("Roast chicken")).not.toBeInTheDocument();
    expect(within(packageRow).queryByText("Steamed fish")).not.toBeInTheDocument();
    const roastChickenRow = screen.getByRole("row", { name: /^2 D-1 Roast chicken/ });
    const steamedFishRow = screen.getByRole("row", { name: /^3 D-2 Steamed fish/ });
    expect(within(roastChickenRow).getByRole("spinbutton", { name: "Unit price Roast chicken" })).toHaveValue(0);
    expect(within(roastChickenRow).getByText("HK$0.00")).toBeInTheDocument();
    expect(within(steamedFishRow).getByRole("spinbutton", { name: "Unit price Steamed fish" })).toHaveValue(10);
    expect(within(steamedFishRow).getByText("HK$10.00")).toBeInTheDocument();

    await user.click(within(document.getElementById("quote-editor-editable-items")!).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveLine).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "quote-1",
      item: expect.objectContaining({ id: "package-1", kind: "package" }),
      packageChoices: [{
        choiceSetId: "choice-set-1",
        packageProductIds: ["member-1", "member-2"],
      }],
    })));
    expect(saveLine).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "quote-1",
      item: expect.objectContaining({ id: "product-1", kind: "product", sku: "D-1" }),
      quantity: 1,
      unitPrice: 0,
    }));
    expect(saveLine).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "quote-1",
      item: expect.objectContaining({ id: "product-2", kind: "product", sku: "D-2" }),
      quantity: 1,
      unitPrice: 10,
    }));
    expect(saveLine).toHaveBeenCalledTimes(3);
  }, 10_000);

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
    expect(screen.getByLabelText("District")).toHaveTextContent("門市自取");
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
    expect(dedupeQuoteOptions(options.districts, "district-duplicate")).toEqual([
      { id: "district-duplicate", name: "Central" },
    ]);
  });

  it("shows all order tags and supports selecting more than one", async () => {
    const user = userEvent.setup();
    renderEditor();

    const tags = await screen.findByRole("group", { name: "Order tags" });
    const birthday = within(tags).getByRole("button", { name: "Birthday" });
    const vip = within(tags).getByRole("button", { name: "VIP" });
    expect(tags.closest(".quote-editor-form-column")).toBe(
      screen.getByText("Asana Link").closest(".quote-editor-form-column"),
    );
    expect(birthday).toHaveAttribute("aria-pressed", "false");
    expect(vip).toHaveAttribute("aria-pressed", "false");

    await user.click(birthday);
    await user.click(vip);

    expect(birthday).toHaveAttribute("aria-pressed", "true");
    expect(vip).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps all order tags visible when editing a quote without selected tags", async () => {
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

    const tags = await screen.findByRole("group", { name: "Order tags" });
    expect(within(tags).getByRole("button", { name: "Birthday" })).toHaveAttribute("aria-pressed", "false");
    expect(within(tags).getByRole("button", { name: "VIP" })).toHaveAttribute("aria-pressed", "false");
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
    await user.type(screen.getByLabelText("Follow-up date"), "2026-08-24");
    await user.selectOptions(screen.getByLabelText("Sales source"), "source-email");
    await user.selectOptions(screen.getByLabelText("Communication channel"), "communication-wati");
    await user.click(within(document.getElementById("quote-editor-editable-details")!).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveDetails).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        quoteStatus: "High Chance",
        quoteSalesSourceId: "source-email",
        quoteCommunicationChannelId: "communication-wati",
        followUpDate: "2026-08-24",
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
    expect(screen.queryByRole("button", { name: /Original remark/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview / edit" }));
    const labelDialog = screen.getByRole("dialog");
    expect(within(labelDialog).getByRole("textbox", { name: "Remarks" })).toHaveValue("Original remark");
    expect(within(labelDialog).getByRole("textbox", { name: "Remarks" })).toHaveAttribute("maxlength", "16");
    await user.click(within(labelDialog).getByRole("button", { name: "Cancel" }));

    const quantityInput = screen.getByRole("spinbutton", { name: "Quantity Roast pork" });
    expect(quantityInput).toHaveAttribute("min", "1");
    expect(quantityInput).toHaveAttribute("step", "1");
    fireEvent.change(quantityInput, { target: { value: "3" } });
    fireEvent.blur(quantityInput);
    await waitFor(() => expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({ id: "line-1", quantity: 3 })));

    saveExistingLine.mockClear();
    fireEvent.change(quantityInput, { target: { value: "1.5" } });
    fireEvent.blur(quantityInput);
    expect(await screen.findByText("Quantity must be a whole number above 0 and price cannot be negative.")).toBeInTheDocument();
    expect(saveExistingLine).not.toHaveBeenCalled();
  });

  it("previews and saves edits to a linked SKU label", async () => {
    const user = userEvent.setup();
    const saveLineLabel = vi.fn().mockResolvedValue(undefined);
    const saveExistingLine = vi.fn().mockResolvedValue(undefined);
    const line: QuoteLine = {
      id: "line-label-1",
      productId: "product-1",
      packageId: null,
      sku: "P001",
      name: "Roast pork",
      quantity: 2,
      unitPrice: 88,
      totalPrice: 176,
      remarks: null,
      labelId: "label-1",
      labelDisplayA: "Roast pork label",
      labelDisplayB: "2 boxes",
    };

    renderEditor({
      loadSummary: vi.fn().mockResolvedValue({
        id: "quote-1",
        orderNumber: "FCLQ-LABEL",
        channelId: "channel-1",
        draft: { ...emptyQuoteDraft },
      }),
      loadLines: vi.fn().mockResolvedValue([line]),
      saveLineLabel,
      saveExistingLine,
    }, "/quotes/quote-1/edit");

    const tabs = await screen.findAllByRole("tab");
    await user.click(tabs[1]);
    expect(screen.getByRole("columnheader", { name: "Label preview" })).toBeInTheDocument();
    expect(screen.queryByLabelText("50 × 75 mm 標籤預覽：FCLQ-LABEL")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview / edit" }));
    expect(screen.getByLabelText("50 × 75 mm 標籤預覽：FCLQ-LABEL")).toBeInTheDocument();
    expect(screen.getByText("－ 送貨日期 －")).toBeInTheDocument();
    const displayA = screen.getByRole("textbox", { name: "Label line 1" });
    await user.clear(displayA);
    await user.type(displayA, "Updated label");
    await user.type(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Remarks" }), "No onion");
    await user.click(screen.getByRole("button", { name: "Save label" }));

    await waitFor(() => expect(saveLineLabel).toHaveBeenCalledWith(expect.objectContaining({
      id: "line-label-1",
      labelId: "label-1",
      labelDisplayA: "Updated label",
      labelDisplayB: "2 boxes",
    })));
    expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({
      id: "line-label-1",
      remarks: "No onion",
    }), "quote");
  });

  it("matches Shopify 12-hour delivery times to the current option", async () => {
    renderEditor({
      loadSummary: vi.fn().mockResolvedValue({
        id: "quote-1",
        orderNumber: "FCLQ-TIME",
        channelId: "channel-1",
        draft: { ...emptyQuoteDraft, deliveryTime: "5:00 PM - 6:00 PM" },
      }),
    }, "/quotes/quote-1/edit");

    await waitFor(() => expect(screen.getByLabelText("Delivery time")).toHaveValue("17:00 - 18:00"));
    expect(screen.queryByPlaceholderText("Enter a custom delivery time")).not.toBeInTheDocument();
  });

  it("shows unmatched Shopify delivery times as custom with the corresponding time", async () => {
    renderEditor({
      loadSummary: vi.fn().mockResolvedValue({
        id: "quote-1",
        orderNumber: "FCLQ-CUSTOM-TIME",
        channelId: "channel-1",
        draft: { ...emptyQuoteDraft, deliveryTime: "5:30 PM - 6:30 PM" },
      }),
    }, "/quotes/quote-1/edit");

    await waitFor(() => expect(screen.getByLabelText("Delivery time")).toHaveValue("custom"));
    expect(screen.getByPlaceholderText("Enter a custom delivery time")).toHaveValue("17:30 - 18:30");
  });

  it("requires only the seven customer and delivery fields on quotes", async () => {
    renderEditor();

    await screen.findByRole("heading", { name: "New quote" });
    expect(screen.getByLabelText(/Brand/)).toBeRequired();
    expect(screen.getByLabelText("Customer name")).toBeRequired();
    expect(screen.getByLabelText("Contact number")).toBeRequired();
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Shipping method")).toBeRequired();
    expect(screen.getByLabelText("District")).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText("Delivery date")).toBeRequired();
    expect(screen.getByLabelText("Company name")).not.toBeRequired();
    expect(screen.getByLabelText("Delivery time")).not.toBeRequired();
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
    const targetRow = screen.getAllByText("Roast pork")
      .map((element) => element.closest("tr"))
      .find(Boolean) ?? null;
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
    expect((await screen.findAllByText("餐具包")).length).toBeGreaterThan(0);
    expect(screen.getByRole("spinbutton", { name: "Unit price 餐具包" })).toHaveValue(0);
    expect(screen.getByRole("spinbutton", { name: "Unit price 餐具包" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Utensil pack added" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "View quote" })).not.toBeInTheDocument();
    expect(screen.queryByText("PDF 內容")).not.toBeInTheDocument();
  });

  it("omits payment records from quote editing and does not write payments when saving", async () => {
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
    expect(tabs).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Payment records" })).not.toBeInTheDocument();
    expect(document.getElementById("quote-editor-editable-payments")).not.toBeInTheDocument();
    await user.click(within(document.getElementById("quote-editor-editable-details")!).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveDetails).toHaveBeenCalled());
    expect(saveFinancialDetails).toHaveBeenCalled();
    expect(savePayments).not.toHaveBeenCalled();
    expect(sendConfirmation).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "FCLQ20260801" })).toBeInTheDocument();
    expect(screen.queryByText("Quotes list")).not.toBeInTheDocument();
  });

  it("searches district options by text", async () => {
    const user = userEvent.setup();
    renderEditor({
      loadOptions: vi.fn().mockResolvedValue({
        ...options,
        districts: [
          { id: "district-1", name: "Central" },
          { id: "district-2", name: "Kowloon Bay" },
        ],
      }),
    }, "/quotes/quote-1/edit");

    const district = await screen.findByRole("combobox", { name: "District" });
    await user.click(district);
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "Kowloon");
    expect(screen.queryByRole("option", { name: "Central" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Kowloon Bay" }));
    expect(district).toHaveTextContent("Kowloon Bay");
  });

  it.each([
    { kind: "quote" as const, path: "/quotes/quote-1/edit", number: "FCLQ20260801" },
    { kind: "order" as const, path: "/orders/order-1/edit", number: "FCCO20260801" },
  ])("saves all data from each available $kind section button", async ({ kind, path, number }) => {
    const user = userEvent.setup();
    const saveDetails = vi.fn().mockResolvedValue(undefined);
    const saveExistingLine = vi.fn().mockResolvedValue(undefined);
    const saveFinancialDetails = vi.fn().mockResolvedValue(undefined);
    const savePayments = vi.fn().mockResolvedValue(undefined);
    const saveFactorySettings = vi.fn().mockResolvedValue(undefined);
    const summary = {
      id: `${kind}-1`, orderNumber: number, channelId: "channel-1",
      draft: {
        ...emptyQuoteDraft,
        channelId: "channel-1",
        customerName: "Customer",
        contactA: "12345678",
        email: "quote@example.com",
        districtId: "district-1",
        shippingMethodId: "shipping-home",
      },
      financials: { shippingFee: 80, discount: 10, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
      isSentToFactory: false,
      doNotSendToFactory: false,
    };
    const line: QuoteLine = {
      id: "line-1", productId: "product-1", packageId: null, sku: "P001",
      name: "Roast pork", quantity: 2, unitPrice: 88, totalPrice: 176, remarks: null,
    };

    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path.replace(`${kind}-1`, ":id")} element={(
            <QuoteEditorPage
              documentType={kind}
              loadOptions={vi.fn().mockResolvedValue(options)}
              loadSummary={vi.fn().mockResolvedValue(summary)}
              loadLines={vi.fn().mockResolvedValue([line])}
              saveDetails={saveDetails}
              saveExistingLine={saveExistingLine}
              saveFinancialDetails={saveFinancialDetails}
              savePayments={savePayments}
              saveFactorySettings={saveFactorySettings}
              loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)}
            />
          )} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: number })).toBeInTheDocument();
    const sectionIds = kind === "order" ? ["details", "items", "payments"] : ["details", "items"];
    for (const section of sectionIds) {
      await user.click(within(document.getElementById(`quote-editor-editable-${section}`)!).getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(saveDetails).toHaveBeenCalledTimes(sectionIds.indexOf(section) + 1));
    }

    expect(saveExistingLine).toHaveBeenCalledTimes(sectionIds.length);
    expect(saveFinancialDetails).toHaveBeenCalledTimes(sectionIds.length);
    if (kind === "order") {
      expect(savePayments).toHaveBeenCalledTimes(3);
      expect(savePayments).toHaveBeenLastCalledWith("order-1", number, "channel-1", [], "order");
      expect(saveFactorySettings).toHaveBeenCalledTimes(3);
    } else {
      expect(savePayments).not.toHaveBeenCalled();
      expect(saveFactorySettings).not.toHaveBeenCalled();
    }
    expect(screen.getByRole("heading", { name: number })).toBeInTheDocument();
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

    expect(await screen.findAllByRole("tab")).toHaveLength(2);
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

  it("shows quote details without payment records", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const longRemark = "No onions, no garlic, keep every sauce separate, and label every tray";
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
          <Route path="/quotes/:id" element={<QuoteEditorPage combined readOnly loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([{ id: "line-1", sku: "PKG-1", name: "Banquet package", quantity: 1, unitPrice: 100, totalPrice: 100, remarks: longRemark }])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "FCLQ20260801" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Quote creation steps" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Customer details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add product" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Payment records" })).not.toBeInTheDocument();
    expect(document.getElementById("quote-editor-readonly-payments")).not.toBeInTheDocument();
    expect(screen.getByText("Customer note")).toBeInTheDocument();
    expect(screen.getByText("Shown on delivery note")).toBeInTheDocument();
    expect(screen.getByText("Birthday")).toBeInTheDocument();
    expect(screen.getByText("High Chance")).toBeInTheDocument();
    expect(screen.getAllByText("Email").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("WATI")).toBeInTheDocument();
    expect(screen.getByText(longRemark)).toHaveAttribute("title", longRemark);
    expect(screen.queryByLabelText("50 × 75 mm 標籤預覽：FCLQ20260801")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View label" }));
    expect(screen.getByLabelText("50 × 75 mm 標籤預覽：FCLQ20260801")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Label line 1" })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Close label dialog" })[1]);
    expect(screen.queryByRole("heading", { name: "額外資訊" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "活動項目" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert to order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send WATI and email order confirmation" })).not.toBeInTheDocument();
    expect(document.querySelector("input, select, textarea")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Add products" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByRole("tab", { name: "Add products" })).toHaveAttribute("aria-selected", "true");
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("shows notification and conversion actions for quote details", async () => {
    const user = userEvent.setup();
    const sendConfirmation = vi.fn().mockResolvedValue(undefined);
    const convertQuote = vi.fn().mockResolvedValue({ id: "order-1", orderNumber: "FCLO20260801" });
    const saveDetails = vi.fn().mockResolvedValue(undefined);
    const saveFinancialDetails = vi.fn().mockResolvedValue(undefined);
    const summary = {
      id: "quote-1", documentType: "quote" as const, orderNumber: "FCLQ20260801", channelId: "channel-1",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
        quoteStatus: "", quoteSalesSourceId: "", quoteCommunicationChannelId: "",
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };

    render(
      <MemoryRouter initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteEditorPage combined readOnly loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([])} saveDetails={saveDetails} saveFinancialDetails={saveFinancialDetails} sendConfirmation={sendConfirmation} convertQuote={convertQuote} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
          <Route path="/orders/:id" element={<div>Converted order</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "FCLQ20260801" });
    await user.click(screen.getByRole("button", { name: "Send WATI and email order confirmation" }));
    await waitFor(() => expect(sendConfirmation).toHaveBeenCalledWith("quote-1"));

    await user.click(screen.getByRole("button", { name: "Convert to order" }));
    await waitFor(() => expect(convertQuote).toHaveBeenCalledWith("quote-1"));
    expect(saveDetails).toHaveBeenCalledWith("quote-1", expect.objectContaining({ customerName: "Customer" }));
    expect(saveFinancialDetails).toHaveBeenCalledWith("quote-1", {
      shippingFee: 0,
      discount: 0,
      cashdollarRedeemed: 0,
      cashdollarPurchased: 0,
    });
    expect(await screen.findByText("Converted order")).toBeInTheDocument();
  });

  it("shows the delivery-note customer note on order editing and details", async () => {
    const user = userEvent.setup();
    const setFactoryStatus = vi.fn().mockResolvedValue(undefined);
    const loadSummary = vi.fn().mockResolvedValue({
      id: "order-1", orderNumber: "FCCO20260801", channelId: "channel-1",
      shopifyOrderId: 7808193593617,
      shopifyStoreDomain: "hklunchbox.myshopify.com",
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "order@example.com", asanaLink: "",
        address: "1 Central Road", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "不要香菜", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
        quoteStatus: "", quoteSalesSourceId: "", quoteCommunicationChannelId: "",
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
      isSentToFactory: false,
      doNotSendToFactory: false,
    });

    const view = render(
      <MemoryRouter initialEntries={["/orders/order-1/edit"]}>
        <Routes>
          <Route path="/orders/:id/edit" element={<QuoteEditorPage documentType="order" setFactoryStatus={setFactoryStatus} loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={loadSummary} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "FCCO20260801" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order FCCO20260801 in Shopify" })).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/hklunchbox/orders/7808193593617",
    );
    expect(screen.getByRole("status", { name: "付款狀態：尚未付款" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Add product|加入貨品/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Payment records|付款紀錄/ })).toBeInTheDocument();
    expect(loadSummary).toHaveBeenCalledWith("order-1", "order");
    expect(screen.getByLabelText(/Customer note|客戶備註/)).toHaveValue("不要香菜");
    expect(screen.getByText(/Shown on delivery note|送貨單顯示/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Success probability|成功機率/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Sales source|報價渠道/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Communication channel|溝通渠道/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert to order" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Add products|加入貨品/ }));
    expect(screen.getByRole("combobox", { name: /Shipping fee option|運費選項/ })).toHaveValue("");
    const doNotSend = screen.getByRole("checkbox", { name: /Do not send to factory|不傳送到工場/ });
    const suppressFactoryChange = screen.getByRole("checkbox", { name: /Do not notify factory of changes|不通知工場有更改/ });
    expect(doNotSend).not.toBeChecked();
    expect(suppressFactoryChange).toBeEnabled();
    expect(screen.getByRole("button", { name: /Send to factory|送至工場/ })).toBeInTheDocument();
    await user.click(suppressFactoryChange);
    expect(suppressFactoryChange).toBeChecked();
    await user.click(screen.getByRole("button", { name: /Send to factory|送至工場/ }));
    expect(setFactoryStatus).toHaveBeenCalledWith("order-1", true);
    expect(doNotSend).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /Cancel factory send|取消送至工場/ }));
    expect(setFactoryStatus).toHaveBeenLastCalledWith("order-1", false);
    expect(doNotSend).not.toBeChecked();

    view.unmount();
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route path="/orders/:id" element={<QuoteEditorPage documentType="order" combined readOnly canEdit setFactoryStatus={setFactoryStatus} loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={loadSummary} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "FCCO20260801" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order FCCO20260801 in Shopify" })).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/hklunchbox/orders/7808193593617",
    );
    expect(screen.getByText(/Customer note|客戶備註/)).toBeInTheDocument();
    expect(screen.getByText(/Shown on delivery note|送貨單顯示/)).toBeInTheDocument();
    expect(screen.queryByText(/Success probability|成功機率/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sales source|報價渠道/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Communication channel|溝通渠道/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Do not send to factory|不傳送到工場/ })).not.toBeInTheDocument();
    const detailSendButton = screen.getByRole("button", { name: /Send to factory|送至工場/ });
    const detailEditLink = screen.getByRole("link", { name: /Edit|編輯/ });
    expect(detailSendButton.closest(".quote-detail-actions")).toBe(detailEditLink.closest(".quote-detail-actions"));
    await user.click(detailSendButton);
    expect(setFactoryStatus).toHaveBeenLastCalledWith("order-1", true);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Send to factory|送至工場/ })).not.toBeInTheDocument());
  });

  it("blocks factory sending from detail and edit pages unless all seven required fields are present", async () => {
    const setFactoryStatus = vi.fn().mockResolvedValue(undefined);
    const loadSummary = vi.fn().mockResolvedValue({
      id: "order-1", orderNumber: "6951", channelId: "",
      draft: {
        channelId: "", customerName: "", companyName: "Optional company",
        contactA: "", contactB: "", email: "", asanaLink: "",
        address: "", districtId: "", districtName: "", shippingMethodId: "",
        deliveryDate: "", deliveryTime: "", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
        quoteStatus: "", quoteSalesSourceId: "", quoteCommunicationChannelId: "",
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
      isSentToFactory: false,
      doNotSendToFactory: false,
    });

    const detail = render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route path="/orders/:id" element={<QuoteEditorPage documentType="order" combined readOnly canEdit setFactoryStatus={setFactoryStatus} loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={loadSummary} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.setup().click(await screen.findByRole("button", { name: "Send to factory" }));
    const detailDialog = screen.getByRole("alertdialog", { name: "Cannot send to factory" });
    expect(detailDialog).toHaveTextContent("Brand");
    expect(detailDialog).toHaveTextContent("Customer name");
    expect(detailDialog).toHaveTextContent("Contact number");
    expect(detailDialog).toHaveTextContent("Email");
    expect(detailDialog).toHaveTextContent("Shipping method");
    expect(detailDialog).toHaveTextContent("District");
    expect(detailDialog).toHaveTextContent("Delivery date");
    expect(detailDialog).not.toHaveTextContent("Company name");
    expect(detailDialog).not.toHaveTextContent("Delivery address");
    expect(detailDialog).not.toHaveTextContent("Delivery time");
    expect(setFactoryStatus).not.toHaveBeenCalled();

    detail.unmount();
    render(
      <MemoryRouter initialEntries={["/orders/order-1/edit"]}>
        <Routes>
          <Route path="/orders/:id/edit" element={<QuoteEditorPage documentType="order" setFactoryStatus={setFactoryStatus} loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={loadSummary} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "6951" });
    await userEvent.setup().click(screen.getByRole("tab", { name: "Add products" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Send to factory" }));
    const editDialog = screen.getByRole("alertdialog", { name: "Cannot send to factory" });
    expect(editDialog).toHaveTextContent("Brand");
    expect(editDialog).toHaveTextContent("Customer name");
    expect(editDialog).toHaveTextContent("Contact number");
    expect(editDialog).toHaveTextContent("Email");
    expect(editDialog).toHaveTextContent("Shipping method");
    expect(editDialog).toHaveTextContent("District");
    expect(editDialog).toHaveTextContent("Delivery date");
    expect(editDialog).not.toHaveTextContent("Company name");
    expect(editDialog).not.toHaveTextContent("Delivery address");
    expect(editDialog).not.toHaveTextContent("Delivery time");
    expect(setFactoryStatus).not.toHaveBeenCalled();
  });
});
