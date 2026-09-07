import { readAppStyles } from "./read-app-styles";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/order-edit-presence", () => ({
  trackOrderEditPresence: vi.fn(() => () => undefined),
}));

const fetchEnquirySubmission = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const saveEnquirySubmissionAnswers = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const convertEnquiryToQuote = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "quote-1", orderNumber: "FCCQ20260902" }));

vi.mock("@/lib/enquiry-forms-api", () => ({
  fetchEnquirySubmission,
  saveEnquirySubmissionAnswers,
  convertEnquiryToQuote,
}));

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
import {
  dedupeQuoteOptions,
  quoteLineLabelRemarkRows,
  quoteLinePrintLabelName,
  quoteLineTotal,
  quoteWorkflowValues,
  type QuoteEditorOptions,
  type QuoteLine,
} from "@/lib/quote-editor";
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
  customerTags: [
    { id: "customer-tag-1", name: "沙田威爾斯", typeName: "醫院" },
    { id: "customer-tag-2", name: "企業客戶", typeName: "渠道" },
  ],
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
  famousBrandTagIds: [],
  isHongKongFamousBrand: false,
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
    expect(quoteWorkflowValues({ ...emptyQuoteDraft, famousBrandTagIds: ["customer-tag-1"] }))
      .toMatchObject({ is_hong_kong_famous_brand: false, famous_brand_tag_ids: ["customer-tag-1"] });
  });
});

describe("quote line label remarks", () => {
  it("pairs one remark with each print label and keeps a single remark when there are none", () => {
    expect(quoteLinePrintLabelName({
      id: "label-1",
      displayA: "(5格) 和風黑椒",
      displayB: "牛柳",
    })).toBe("(5格) 和風黑椒牛柳");
    expect(quoteLinePrintLabelName({
      id: "label-2",
      displayA: "童趣拼盤(台灣腸蟹蓋",
      displayB: "肉丸年糕各6件)",
    })).toBe("童趣拼盤(台灣腸蟹蓋肉丸年糕各6件)");
    expect(quoteLinePrintLabelName({ id: "label-3", displayA: "  ", displayB: "8-10位" }))
      .toBe("8-10位");

    const withLabels: QuoteLine = {
      id: "line-1",
      productId: "product-1",
      packageId: null,
      sku: "KCH003-2",
      name: "花膠原隻雞燉湯 (8-10位)",
      quantity: 1,
      unitPrice: 208,
      totalPrice: 208,
      remarks: "少鹽",
      labelRemarks: ["少鹽"],
      labels: [
        { id: "label-1", displayA: "花膠原隻雞燉湯 (8-10位)", displayB: null },
        { id: "label-2", displayA: "花膠原隻雞燉湯 (湯底)", displayB: null },
        { id: "label-3", displayA: "花膠原隻雞燉湯 (配料)", displayB: null },
      ],
    };
    expect(quoteLineLabelRemarkRows(withLabels)).toEqual([
      { label: withLabels.labels![0], remark: "少鹽" },
      { label: withLabels.labels![1], remark: "" },
      { label: withLabels.labels![2], remark: "" },
    ]);

    const withoutLabels: QuoteLine = {
      ...withLabels,
      labels: [],
      remarks: "走蔥",
      labelRemarks: undefined,
    };
    expect(quoteLineLabelRemarkRows(withoutLabels)).toEqual([
      { label: null, remark: "走蔥" },
    ]);
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
  const rendered = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/quotes/new" element={<QuoteEditorPage {...props} />} />
        <Route path="/quotes/:id/edit" element={<QuoteEditorPage {...props} />} />
        <Route path="/quotes/pending/:id" element={<QuoteEditorPage pendingEnquiry {...props} />} />
        <Route path="/orders/new" element={<QuoteEditorPage {...props} />} />
        <Route path="/orders/:id/edit" element={<QuoteEditorPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...props, unmount: rendered.unmount };
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
    fetchEnquirySubmission.mockReset();
    fetchEnquirySubmission.mockResolvedValue(null);
    saveEnquirySubmissionAnswers.mockReset();
    convertEnquiryToQuote.mockReset();
    convertEnquiryToQuote.mockResolvedValue({ id: "quote-1", orderNumber: "FCCQ20260902" });
  });

  it("releases an order edit session with keepalive when the page closes", async () => {
    const touchEditSession = vi.fn().mockResolvedValue(undefined);
    const releaseEditSession = vi.fn().mockResolvedValue(undefined);
    const stopEditPresence = vi.fn();
    const startEditPresence = vi.fn(() => stopEditPresence);

    const rendered = renderEditor(
      {
        documentType: "order",
        touchEditSession,
        releaseEditSession,
        startEditPresence,
      },
      "/orders/order-1/edit",
    );

    expect(startEditPresence).toHaveBeenCalledWith("order-1", expect.any(String));
    await waitFor(() => expect(touchEditSession).toHaveBeenCalledWith(
      "order-1",
      expect.any(String),
    ));

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => expect(releaseEditSession).toHaveBeenCalledWith(
      expect.any(String),
      { keepalive: true },
    ));

    rendered.unmount();
    expect(stopEditPresence).toHaveBeenCalledTimes(1);
  });

  it("keeps the mobile details grid and footer controls inside the panel", () => {
    const css = readAppStyles();
    const responsiveGridRule = css.match(
      /@media \(max-width: 960px\)[\s\S]*?\.quote-editor-form,[\s\S]*?\.quote-items-layout\s*\{([^}]*)\}/,
    )?.[1];
    const mobileFooterRule = css.match(
      /\.quote-editor-form\s*>\s*footer\s*\{([^}]*)\}/g,
    )?.at(-1);
    const mobileFooterButtonRule = css.match(
      /\.quote-editor-form\s*>\s*footer\s+\.ui-button\s*\{([^}]*)\}/g,
    )?.at(-1);

    expect(responsiveGridRule).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(mobileFooterRule).toContain("flex-direction: row");
    expect(mobileFooterRule).toContain("flex-wrap: nowrap");
    expect(mobileFooterButtonRule).toContain("min-width: 0");
    expect(css).toMatch(/\.quote-payment-step\s*>\s*footer\s+\.ui-button\s*\{[^}]*width:\s*auto/);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.quote-payment-step\s*>\s*footer\s*\{[^}]*flex-direction:\s*row/);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.quote-payment-step\s*>\s*footer\s+\.ui-button\s*\{[^}]*flex:\s*1 1 0/);
    expect(css).toMatch(/\.quote-payment-summary\s*\{[^}]*max-width:\s*640px/);
    expect(css).toMatch(/\.quote-payment-summary\s*>\s*div\.is-overpaid\s*\{/);
    const itemCountRule = css.match(/\.quote-editor-item-count\s*\{([^}]*)\}/)?.[1];
    expect(itemCountRule).toContain("display: flex");
    expect(itemCountRule).toContain("flex-wrap: nowrap");
    expect(itemCountRule).toContain("justify-content: space-between");
    expect(itemCountRule).toContain("align-items: center");
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
    const card = within(mobileList).getByRole("listitem");
    expect(card).toHaveTextContent("Mobile banquet");
    expect(document.querySelector(".quote-lines-panel table")).not.toBeInTheDocument();
    expect(within(mobileList).getByRole("spinbutton", { name: "Quantity" })).toHaveValue(2);
    const actionRows = card.querySelectorAll(".quote-mobile-line-actions");
    expect(actionRows).toHaveLength(1);
    const actions = actionRows[0];
    expect(actions).toBeTruthy();
    const preview = within(actions as HTMLElement).getByRole("button", { name: "Preview" });
    const remove = within(actions as HTMLElement).getByRole("button", { name: "Remove Mobile banquet" });
    expect(preview.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelector(".quote-mobile-label-button")).not.toBeInTheDocument();
    expect(card.textContent).not.toMatch(/Preview/);
  });

  it("saves quote details before opening the product step", async () => {
    const user = userEvent.setup();
    const props = renderEditor();

    expect(await screen.findByRole("heading", { name: "New quote" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Quote creation steps" })).toBeInTheDocument();
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
    expect(screen.getByText("You can now start adding products.")).toBeInTheDocument();
  });

  it("creates orders from the shared editor and opens the order edit step", async () => {
    const user = userEvent.setup();
    const createOrder = vi.fn().mockResolvedValue({
      id: "order-1",
      orderNumber: "FCCO20260801",
    });
    const loadSummary = vi.fn().mockResolvedValue({
      id: "order-1",
      orderNumber: "FCCO20260801",
      channelId: "channel-1",
    });
    const props = renderEditor(
      { documentType: "order", createOrder, loadSummary },
      "/orders/new",
    );

    expect(await screen.findByRole("heading", { name: "Order Details" })).toBeInTheDocument();
    await fillRequiredQuoteDetails(user);
    await user.click(screen.getByRole("button", { name: "Save and add products" }));

    await waitFor(() => expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({
      channelId: "channel-1",
      customerName: "BWT Database",
    })));
    expect(props.saveQuote).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "FCCO20260801" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add product" })).toBeInTheDocument();
  });

  it("copies an order through the shared editor", async () => {
    const user = userEvent.setup();
    const copyOrder = vi.fn().mockResolvedValue({
      id: "copied-order",
      orderNumber: "FCCO-COPIED-001",
    });
    const loadSummary = vi.fn().mockResolvedValue({
      id: "source-order",
      orderNumber: "FCCO20260701",
      channelId: "channel-1",
      draft: {
        ...emptyQuoteDraft,
        channelId: "channel-1",
        customerName: "Copied customer",
        contactA: "94808987",
        email: "copied@example.com",
        districtId: "district-1",
        shippingMethodId: "shipping-home",
        deliveryTime: "12:00 - 13:00",
        shipOutTime: "11:30",
      },
    });

    renderEditor(
      { documentType: "order", copyOrder, loadSummary },
      "/orders/new?copyFrom=source-order",
    );

    expect(await screen.findByLabelText("Customer name")).toHaveValue("Copied customer");
    expect(screen.getByLabelText("Delivery time")).toHaveValue("12:00 - 13:00");
    expect(screen.getByLabelText("Dispatch time")).toHaveValue("11:30");
    const orderNumber = screen.getByLabelText("Quote no.");
    await user.type(orderNumber, "FCCO-COPIED-001");
    await user.click(screen.getByRole("button", { name: "Save and add products" }));

    await waitFor(() => expect(copyOrder).toHaveBeenCalledWith(
      "source-order",
      expect.objectContaining({
        orderNumber: "FCCO-COPIED-001",
        customerName: "Copied customer",
      }),
    ));
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
    const copiedQuoteNumber = screen.getByLabelText("Quote no.");
    expect(copiedQuoteNumber).toBeRequired();
    await user.type(copiedQuoteNumber, "FCLQ-COPIED-001");

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
          orderNumber: "FCLQ-COPIED-001",
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

    await user.click(await screen.findByRole("button", { name: "Custom product" }));
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

    await user.type(within(panel).getByPlaceholderText("Search product name or SKU"), "Chicken");
    expect(within(panel).queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    await waitFor(() => expect(loadLunchboxProducts).toHaveBeenCalledWith(expect.objectContaining({
      search: "Chicken",
    })));

    await user.click(within(panel).getByRole("button", { name: "Filters" }));
    await user.type(within(panel).getByRole("spinbutton", { name: "Minimum" }), "60");
    await user.type(within(panel).getByRole("spinbutton", { name: "Maximum" }), "80");
    await waitFor(() => expect(loadLunchboxProducts).toHaveBeenCalledWith(expect.objectContaining({
      priceRange: "",
      priceMin: 60,
      priceMax: 80,
    })));
    expect(within(panel).getByRole("button", { name: /HK\$60 – HK\$80/ })).toBeInTheDocument();

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
    expect(within(packageRow).queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    const roastChickenRow = screen.getByRole("row", { name: /^2 D-1 Roast chicken/ });
    const steamedFishRow = screen.getByRole("row", { name: /^3 D-2 Steamed fish/ });
    expect(within(roastChickenRow).getByRole("button", { name: "Preview" })).toBeInTheDocument();
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

  it("shows product remarks below the product and edits them inline", async () => {
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
    expect(screen.getByRole("columnheader", { name: "Remarks" })).toBeInTheDocument();
    const remarkInput = screen.getByRole("textbox", { name: "Remarks Roast pork" });
    expect(remarkInput).toBeInTheDocument();
    expect(remarkInput.closest("td")).toHaveClass("quote-line-remarks");
    expect(remarkInput).toHaveValue("Original remark");
    expect(remarkInput).toHaveAttribute("maxlength", "16");
    expect(remarkInput).toHaveAttribute("rows", "2");
    expect(screen.queryByRole("button", { name: /Original remark/ })).not.toBeInTheDocument();
    await user.clear(remarkInput);
    await user.type(remarkInput, "No onion");
    await user.tab();
    await waitFor(() => expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({
      id: "line-1",
      remarks: "No onion",
    })));
    expect(screen.getByRole("textbox", { name: "Remarks Roast pork" })).toHaveValue("No onion");

    saveExistingLine.mockClear();
    const quantityInput = screen.getByRole("spinbutton", { name: "Quantity Roast pork" });
    expect(quantityInput).toHaveAttribute("min", "0");
    expect(quantityInput).toHaveAttribute("step", "1");
    fireEvent.change(quantityInput, { target: { value: "3" } });
    fireEvent.blur(quantityInput);
    await waitFor(() => expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({ id: "line-1", quantity: 3 })));

    saveExistingLine.mockClear();
    fireEvent.change(quantityInput, { target: { value: "0" } });
    fireEvent.blur(quantityInput);
    await waitFor(() => expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({ id: "line-1", quantity: 0 })));

    saveExistingLine.mockClear();
    fireEvent.change(quantityInput, { target: { value: "1.5" } });
    fireEvent.blur(quantityInput);
    expect(await screen.findByText("Quantity must be a whole number of 0 or more and price cannot be negative.")).toBeInTheDocument();
    expect(saveExistingLine).not.toHaveBeenCalled();
  });

  it("previews and saves edits to a linked SKU label", async () => {
    const user = userEvent.setup();
    const saveLineLabel = vi.fn().mockResolvedValue(undefined);
    const saveExistingLine = vi.fn().mockResolvedValue(undefined);
    const line: QuoteLine = {
      id: "line-label-1",
      productId: "product-1",
      packageId: "package-1",
      sku: "P001",
      name: "Roast pork",
      quantity: 2,
      unitPrice: 88,
      totalPrice: 176,
      remarks: "Line note",
      labelRemarks: ["Line note", "Sauce note"],
      labelId: "label-1",
      labelDisplayA: "柳粒飯 (甘栗紫薯餅、芝士年糕、雞肉丸)",
      labelDisplayB: "2 boxes",
      labels: [
        { id: "label-1", displayA: "柳粒飯 (甘栗紫薯餅、芝士年糕、雞肉丸)", displayB: "2 boxes" },
        { id: "label-2", displayA: "Sauce label", displayB: "1 cup" },
      ],
    };

    renderEditor({
      loadSummary: vi.fn().mockResolvedValue({
        id: "quote-1",
        orderNumber: "FCLQ-LABEL",
        channelId: "channel-1",
        draft: { ...emptyQuoteDraft, packingNote: "Factory packing note" },
      }),
      loadLines: vi.fn().mockResolvedValue([line]),
      saveLineLabel,
      saveExistingLine,
    }, "/quotes/quote-1/edit");

    const tabs = await screen.findAllByRole("tab");
    await user.click(tabs[1]);
    expect(screen.queryByRole("columnheader", { name: "Label preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Remarks" })).toBeInTheDocument();
    const editableLineRow = screen.getByRole("row", { name: /Roast pork/ });
    const editablePreviewButton = within(editableLineRow).getByRole("button", { name: "Preview" });
    expect(editablePreviewButton.closest("td")).toBe(editableLineRow.lastElementChild);
    const productCell = within(editableLineRow).getByText("柳粒飯 (甘栗紫薯餅、芝士年糕、雞肉丸)2 boxes").closest("td");
    const firstRemark = screen.getByRole("textbox", { name: "Remarks Roast pork 1" });
    const secondRemark = screen.getByRole("textbox", { name: "Remarks Roast pork 2" });
    expect(productCell).toHaveClass("quote-line-product");
    expect(within(editableLineRow).getByText("Sauce label1 cup").closest("td")).toBe(productCell);
    expect(firstRemark.closest("td")).toHaveClass("quote-line-remarks");
    expect(secondRemark.closest("td")).toHaveClass("quote-line-remarks");
    expect(firstRemark).toHaveValue("Line note");
    expect(secondRemark).toHaveValue("Sauce note");
    expect(screen.queryByRole("button", { name: /Remarks Roast pork 1/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("50 × 75 mm 標籤預覽：FCLQ-LABEL")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getAllByLabelText("50 × 75 mm 標籤預覽：FCLQ-LABEL")).toHaveLength(2);
    expect(screen.getAllByText("－ 送貨日期 －")).toHaveLength(2);
    expect(within(screen.getByRole("dialog")).getByText("Sauce label")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Line note")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Sauce note")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByText("Factory packing note")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByRole("textbox")).not.toBeInTheDocument();
    expect(saveLineLabel).not.toHaveBeenCalled();
    expect(saveExistingLine).not.toHaveBeenCalled();
  });

  it("shows print labels and remarks on quote details without click-to-edit", async () => {
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route
            path="/quotes/:id"
            element={(
              <QuoteEditorPage
                combined
                readOnly
                loadOptions={vi.fn().mockResolvedValue(options)}
                loadSummary={vi.fn().mockResolvedValue({
                  id: "quote-1",
                  orderNumber: "FCLQ-LABEL",
                  channelId: "channel-1",
                  draft: emptyQuoteDraft,
                })}
                loadLines={vi.fn().mockResolvedValue([{
                  id: "line-1",
                  sku: "P001",
                  name: "Roast pork",
                  quantity: 1,
                  unitPrice: 88,
                  totalPrice: 88,
                  remarks: "Line note",
                  labelRemarks: ["Line note", "Sauce note", ""],
                  labels: [
                    { id: "label-1", displayA: "Roast pork label", displayB: "2 boxes" },
                    { id: "label-2", displayA: "Sauce label", displayB: "1 cup" },
                    { id: "label-3", displayA: "Empty label", displayB: "" },
                  ],
                }])}
                loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    const row = await screen.findByRole("row", { name: /Roast pork/ });
    expect(screen.getByRole("columnheader", { name: "Remarks" })).toBeInTheDocument();
    const firstLabel = within(row).getByText("Roast pork label2 boxes");
    const secondLabel = within(row).getByText("Sauce label1 cup");
    const firstRemark = within(row).getByText("Remarks: Line note");
    const secondRemark = within(row).getByText("Remarks: Sauce note");
    expect(firstLabel.closest("td")).toHaveClass("quote-line-product");
    expect(secondLabel.closest("td")).toBe(firstLabel.closest("td"));
    expect(firstRemark.closest("td")).toBe(firstLabel.closest("td"));
    expect(secondRemark.closest("td")).toBe(firstLabel.closest("td"));
    expect(firstLabel.closest(".quote-line-label-remark-pair")).toContainElement(firstRemark);
    expect(secondLabel.closest(".quote-line-label-remark-pair")).toContainElement(secondRemark);
    expect(firstRemark).toHaveClass("quote-line-label-remark-text");
    expect(secondRemark).toHaveClass("quote-line-label-remark-text");
    expect(firstRemark).not.toHaveClass("is-empty");
    const emptyLabel = within(row).getByText("Empty label");
    expect(emptyLabel.closest(".quote-line-label-remark-pair")).toHaveClass("is-empty");
    expect(emptyLabel.closest(".quote-line-label-remark-pair")?.querySelector(".quote-line-label-remark-text")).toHaveClass("is-empty");
    expect(emptyLabel).toHaveClass("quote-line-label-chip");
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remarks Roast pork/ })).not.toBeInTheDocument();
  });

  it("keeps details print-label chips no wider than their text", () => {
    const css = readAppStyles();
    const rule = css.match(
      /\.quote-lines-readonly-panel \.quote-line-label-chip\s*\{([^}]*)\}/,
    )?.[1];

    expect(rule).toContain("display: inline-flex");
    expect(rule).toContain("width: fit-content");
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
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "11:00",
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

  it.each([
    ["quote", "/quotes/quote-1/edit"],
    ["order", "/orders/quote-1/edit"],
  ] as const)("inserts a product at the edited %s sequence and shifts later products", async (documentType, route) => {
    const user = userEvent.setup();
    const saveLineOrder = vi.fn().mockResolvedValue(undefined);
    const lines: QuoteLine[] = Array.from({ length: 26 }, (_, index) => ({
      id: `line-${index + 1}`,
      productId: `product-${index + 1}`,
      packageId: null,
      sku: `P${String(index + 1).padStart(3, "0")}`,
      name: `Product ${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      remarks: null,
    }));

    renderEditor({
      documentType,
      loadSummary: vi.fn().mockResolvedValue({
        id: "quote-1",
        orderNumber: documentType === "quote" ? "FCLQ20260801" : "FCLO20260801",
        channelId: "channel-1",
        draft: { ...emptyQuoteDraft, channelId: "channel-1" },
      }),
      loadLines: vi.fn().mockResolvedValue(lines),
      saveLineOrder,
    }, route);

    const tabs = await screen.findAllByRole("tab");
    await user.click(tabs[1]);
    const sequence = screen.getByRole("spinbutton", { name: "No. Product 26" });
    await user.clear(sequence);
    await user.type(sequence, "10");
    await user.tab();

    const expectedOrder = [
      ...Array.from({ length: 9 }, (_, index) => `line-${index + 1}`),
      "line-26",
      ...Array.from({ length: 16 }, (_, index) => `line-${index + 10}`),
    ];
    await waitFor(() => expect(saveLineOrder).toHaveBeenCalledWith(expectedOrder));
    expect(screen.getByRole("spinbutton", { name: "No. Product 26" })).toHaveValue(10);
    expect(screen.getByRole("spinbutton", { name: "No. Product 10" })).toHaveValue(11);
    expect(screen.getByRole("spinbutton", { name: "No. Product 25" })).toHaveValue(26);

    const movedSequence = screen.getByRole("spinbutton", { name: "No. Product 26" });
    await user.clear(movedSequence);
    await user.type(movedSequence, "26");
    await user.tab();

    const originalOrder = Array.from({ length: 26 }, (_, index) => `line-${index + 1}`);
    await waitFor(() => expect(saveLineOrder).toHaveBeenLastCalledWith(originalOrder));
    expect(screen.getByRole("spinbutton", { name: "No. Product 11" })).toHaveValue(11);
    expect(screen.getByRole("spinbutton", { name: "No. Product 26" })).toHaveValue(26);
  });

  it("keeps the wider sequence field readable without horizontal scrolling or clipping", () => {
    const css = readAppStyles();
    expect(css).toMatch(/\.quote-lines-panel \.table-wrap\s*\{[^}]*overflow-x:\s*hidden/);
    expect(css).toMatch(/\.quote-lines-panel table\s*\{[^}]*table-layout:\s*fixed/);
    expect(css).toMatch(/\.quote-line-sequence-input\s*\{[^}]*min-width:\s*48px/);
    expect(css).toMatch(/\.quote-line-sequence-input\s*\{[^}]*min-height:\s*40px/);
    expect(css).toMatch(/\.quote-line-sequence-input\s*\{[^}]*appearance:\s*textfield/);
    expect(css).toMatch(/\.quote-lines-panel th:nth-child\(1\)\s*\{\s*width:\s*11%/);
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
    const discountLabel = screen.getByRole("textbox", { name: "折扣顯示文字" });
    await user.clear(discountLabel);
    await user.type(discountLabel, "9.5折扣");
    await waitFor(() => expect(JSON.parse(
      localStorage.getItem("fccd:quote-pdf-draft:quote-1") || "{}",
    ).discountLabel).toBe("9.5折扣"));
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
    expect(screen.queryByRole("button", { name: "Add to product catalog" })).not.toBeInTheDocument();
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
    expect(saveFinancialDetails).not.toHaveBeenCalled();
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
    { kind: "quote" as const, path: "/quotes/quote-1/edit" },
    { kind: "order" as const, path: "/orders/order-1/edit" },
  ])("adds and selects a new district from the $kind editor", async ({ kind, path }) => {
    const user = userEvent.setup();
    const createDistrict = vi.fn().mockResolvedValue({
      id: "district-new",
      name: "Tseung Kwan O",
    });
    renderEditor({
      documentType: kind,
      createDistrict,
    }, path);

    const district = await screen.findByRole("combobox", { name: "District" });
    await user.click(district);
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "Tseung Kwan O");
    await user.click(screen.getByRole("button", { name: /Tseung Kwan O/ }));

    await waitFor(() => expect(createDistrict).toHaveBeenCalledWith("Tseung Kwan O"));
    expect(district).toHaveTextContent("Tseung Kwan O");
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

    if (kind === "order") {
      const payments = document.getElementById("quote-editor-editable-payments")!;
      const paymentFooter = payments.querySelector("footer")!;
      expect(within(payments).queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
      expect(within(paymentFooter).getByRole("button", { name: "Add payment" })).toBeInTheDocument();
      expect(within(paymentFooter).getByRole("button", { name: "Save changes" })).toBeInTheDocument();
      expect(payments.querySelector("header")?.textContent).not.toContain("Add payment");
      expect(saveExistingLine).toHaveBeenCalledTimes(sectionIds.length);
      expect(saveFinancialDetails).toHaveBeenCalledTimes(sectionIds.length);
      expect(savePayments).toHaveBeenCalledTimes(3);
      expect(savePayments).toHaveBeenLastCalledWith("order-1", number, "channel-1", [], "order");
      expect(saveFactorySettings).toHaveBeenCalledTimes(3);
    } else {
      expect(saveExistingLine).not.toHaveBeenCalled();
      expect(saveFinancialDetails).not.toHaveBeenCalled();
      expect(savePayments).not.toHaveBeenCalled();
      expect(saveFactorySettings).not.toHaveBeenCalled();
    }
    expect(screen.getByRole("heading", { name: number })).toBeInTheDocument();
  });

  it("does not offer notification sending from quote editing", async () => {
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
    expect(screen.queryByRole("button", { name: /Send WATI and email/ })).not.toBeInTheDocument();
  });

  it("keeps additional information focused while typing a multi-character edit", async () => {
    const user = userEvent.setup();
    renderEditor({
      loadSummary: vi.fn().mockResolvedValue({
        id: "quote-1",
        orderNumber: "FCLQ20260801",
        channelId: "channel-1",
        supplements: {
          additionalInfo: ["每個便當包括一份餐具"],
          activities: [{ id: "activity-1", description: "September events", amount: "14000" }],
          utensilPackQuantity: "0",
        },
        draft: {
          ...emptyQuoteDraft,
          channelId: "channel-1",
          customerName: "Customer",
          contactA: "12345678",
          email: "quote@example.com",
          districtId: "district-1",
          shippingMethodId: "shipping-home",
        },
        financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      }),
    }, "/quotes/quote-1/edit");

    await user.click(await screen.findByRole("tab", { name: "Add products" }));
    const additional = screen.getByLabelText("額外資訊 1");
    const activity = screen.getByLabelText("活動項目 1");
    await user.clear(additional);
    await user.type(additional, "請提供素食選擇");
    expect(additional).toHaveValue("請提供素食選擇");
    expect(additional).toHaveFocus();

    await user.clear(activity);
    await user.type(activity, "Updated activity");
    expect(activity).toHaveValue("Updated activity");
    expect(activity).toHaveFocus();
  });

  it("places convert to order on the first quote step instead of the list", async () => {
    const user = userEvent.setup();
    const convertQuote = vi.fn().mockResolvedValue({ id: "order-1", orderNumber: "FCLO20260801" });
    const summary = {
      id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1",
      grandTotal: 28_350,
      supplements: {
        additionalInfo: ["每個便當包括一份餐具"],
        activities: [
          { id: "activity-1", description: "September events", amount: "14000" },
          { id: "activity-2", description: "October events", amount: "17500" },
        ],
        utensilPackQuantity: "0",
      },
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
      },
      financials: { shippingFee: 0, discount: 3_150, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1/edit"]}>
        <Routes>
          <Route path="/quotes/:id/edit" element={<QuoteEditorPage loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([{
            id: "legacy-line-1", productId: "product-1", packageId: null, sku: "P001",
            name: "Legacy migrated line", quantity: 70, unitPrice: 245, totalPrice: 17_150, remarks: null,
          }])} saveDetails={vi.fn().mockResolvedValue(undefined)} saveFinancialDetails={vi.fn().mockResolvedValue(undefined)} convertQuote={convertQuote} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
          <Route path="/orders/:id" element={<div>Converted order</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "FCLQ20260801" });
    expect(screen.getAllByText("HK$28,350.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("HK$45,500.00")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Convert to order" }));
    await waitFor(() => expect(convertQuote).toHaveBeenCalledWith("quote-1"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Converted order")).toBeInTheDocument();
  });

  it("shows quote details without payment records", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const longRemark = "No onions, no garlic, keep every sauce separate, and label every tray";
    const summary = {
      id: "quote-1", orderNumber: "FCBQ20260834", channelId: "channel-1",
      grandTotal: 28_350,
      supplements: {
        additionalInfo: [
          "每個便當包括一份餐具",
          "每款揀選的飯盒最少3盒",
        ],
        activities: [
          { id: "activity-1", description: "9月4、11、18、25日 各70個下午茶餐盒 (共4天)", amount: "14000" },
          { id: "activity-2", description: "10月2、9、16、23、30日 各70個下午茶餐盒 (共5天)", amount: "17500" },
        ],
        utensilPackQuantity: "0",
      },
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "Company",
        contactA: "12345678", contactB: "", email: "quote@example.com", asanaLink: "",
        address: "", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: ["tag-1"],
        quoteStatus: "High Chance", quoteSalesSourceId: "source-email", quoteCommunicationChannelId: "communication-wati",
      },
      financials: { shippingFee: 0, discount: 3_150, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteEditorPage combined readOnly loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([{ id: "line-1", sku: "PKG-1", name: "Banquet package", quantity: 0, unitPrice: 50, totalPrice: 0, remarks: longRemark }])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "FCBQ20260834" })).toBeInTheDocument();
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
    expect(screen.getByText(`Remarks: ${longRemark}`)).toHaveAttribute("title", `Remarks: ${longRemark}`);
    expect(screen.getByText(`Remarks: ${longRemark}`)).toHaveClass("quote-line-label-remark-text");
    expect(screen.getAllByText("HK$28,350.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("columnheader", { name: "Label preview" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("50 × 75 mm 標籤預覽：FCBQ20260834")).not.toBeInTheDocument();
    const readonlyPreviewButton = screen.getByRole("button", { name: "Preview" });
    const readonlyLineRow = readonlyPreviewButton.closest("tr");
    expect(readonlyLineRow).not.toBeNull();
    expect(readonlyPreviewButton.closest("td")).toBe(readonlyLineRow?.lastElementChild);
    await user.click(readonlyPreviewButton);
    expect(screen.getByLabelText("50 × 75 mm 標籤預覽：FCBQ20260834")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Label line 1" })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Close label dialog" })[1]);
    expect(screen.getByRole("heading", { name: "額外資訊" })).toBeInTheDocument();
    expect(screen.getByText("每個便當包括一份餐具")).toBeInTheDocument();
    expect(screen.getByText("每款揀選的飯盒最少3盒")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "活動項目" })).toBeInTheDocument();
    expect(screen.getByText("9月4、11、18、25日 各70個下午茶餐盒 (共4天)")).toBeInTheDocument();
    expect(screen.getByText("10月2、9、16、23、30日 各70個下午茶餐盒 (共5天)")).toBeInTheDocument();
    expect(screen.getByText("HK$14,000.00")).toBeInTheDocument();
    expect(screen.getByText("HK$17,500.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert to order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send WATI and email order confirmation" })).not.toBeInTheDocument();
    expect(document.querySelector("input, select, textarea")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Add products" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByRole("tab", { name: "Add products" })).toHaveAttribute("aria-selected", "true");
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("shows conversion but not notification actions for quote details", async () => {
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
          <Route path="/quotes/:id" element={<QuoteEditorPage combined readOnly canEdit loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([])} saveDetails={saveDetails} saveFinancialDetails={saveFinancialDetails} sendConfirmation={sendConfirmation} convertQuote={convertQuote} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
          <Route path="/quotes/:id/edit" element={<div>Edit quote</div>} />
          <Route path="/orders/:id" element={<div>Converted order</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "FCLQ20260801" });
    expect(screen.getByRole("heading", { name: "額外資訊" })).toBeInTheDocument();
    expect(screen.getByText("尚未新增額外資訊")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "活動項目" })).toBeInTheDocument();
    expect(screen.getByText("尚未新增活動項目")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit|編輯/ })).toHaveAttribute("href", "/quotes/quote-1/edit");
    expect(screen.queryByRole("button", { name: /Send WATI and email/ })).not.toBeInTheDocument();
    expect(sendConfirmation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Convert to order" }));
    await waitFor(() => expect(convertQuote).toHaveBeenCalledWith("quote-1"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(saveDetails).toHaveBeenCalledWith("quote-1", expect.objectContaining({ customerName: "Customer" }));
    expect(saveFinancialDetails).not.toHaveBeenCalled();
    expect(await screen.findByText("Converted order")).toBeInTheDocument();
  });

  it("shows the delivery-note customer note on order editing and details", async () => {
    const user = userEvent.setup();
    const setFactoryStatus = vi.fn().mockResolvedValue(undefined);
    const sendConfirmation = vi.fn().mockResolvedValue({ includesAddonLink: true });
    const loadSummary = vi.fn().mockResolvedValue({
      id: "order-1", orderNumber: "FCCO20260801", channelId: "channel-1",
      shopifyOrderId: 7808193593617,
      shopifyStoreDomain: "hklunchbox.myshopify.com",
      draft: {
        famousBrandTagIds: ["customer-tag-1"],
        channelId: "channel-1", customerName: "Customer", companyName: "Company", isHongKongFamousBrand: true,
        contactA: "12345678", contactB: "", email: "order@example.com", asanaLink: "",
        address: "1 Central Road", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21", deliveryTime: "12:00 - 13:00", shipOutTime: "11:00",
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
          <Route path="/orders/:id/edit" element={<QuoteEditorPage documentType="order" sendConfirmation={sendConfirmation} setFactoryStatus={setFactoryStatus} loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={loadSummary} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "FCCO20260801" })).toBeInTheDocument();
    const editShopifyLink = screen.getByRole("link", { name: "Open order FCCO20260801 in Shopify" });
    expect(editShopifyLink).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/hklunchbox/orders/7808193593617",
    );
    expect(editShopifyLink.closest(".quote-order-number-control")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "付款狀態：尚未付款" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Add product|加入貨品/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Payment records|付款紀錄/ })).toBeInTheDocument();
    expect(loadSummary).toHaveBeenCalledWith("order-1", "order");
    expect(screen.getByLabelText(/Customer note|客戶備註/)).toHaveValue("不要香菜");
    const famousBrandSelect = screen.getByRole("combobox", { name: "Customer tags" });
    await user.click(famousBrandSelect);
    const famousBrandTag = screen.getByRole("option", { name: "沙田威爾斯" });
    expect(famousBrandTag).toHaveAttribute("aria-selected", "true");
    await user.click(famousBrandTag);
    expect(famousBrandTag).toHaveAttribute("aria-selected", "false");
    await user.click(famousBrandTag);
    expect(famousBrandTag).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Shown on delivery note|送貨單顯示/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Success probability|成功機率/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Sales source|報價渠道/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Communication channel|溝通渠道/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert to order" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send WATI and email order confirmation with add-on link" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Add products|加入貨品/ }));
    expect(screen.getByRole("combobox", { name: /Shipping fee option|運費選項/ })).toHaveValue("");
    const doNotSend = screen.queryByRole("checkbox", { name: /Do not send to factory|不傳送到工場/ });
    const suppressFactoryChange = screen.getByRole("checkbox", { name: /Do not notify factory of changes|不通知工場有更改/ });
    expect(doNotSend).not.toBeInTheDocument();
    expect(suppressFactoryChange).toBeEnabled();
    expect(screen.getByRole("button", { name: /Send to factory|送至工場/ })).toBeInTheDocument();
    await user.click(suppressFactoryChange);
    expect(suppressFactoryChange).toBeChecked();
    await user.click(screen.getByRole("button", { name: /Send to factory|送至工場/ }));
    expect(setFactoryStatus).toHaveBeenCalledWith("order-1", true);
    await user.click(screen.getByRole("button", { name: /Cancel factory send|取消送至工場/ }));
    expect(setFactoryStatus).toHaveBeenLastCalledWith("order-1", false);
    expect(screen.queryByRole("button", { name: /新增額外資訊|Add additional information/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新增活動項目|Add activity item/ })).not.toBeInTheDocument();

    view.unmount();
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route path="/orders/:id" element={<QuoteEditorPage documentType="order" combined readOnly canEdit sendConfirmation={sendConfirmation} setFactoryStatus={setFactoryStatus} loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={loadSummary} loadLines={vi.fn().mockResolvedValue([])} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "FCCO20260801" })).toBeInTheDocument();
    const detailShopifyLink = screen.getByRole("link", { name: "Open order FCCO20260801 in Shopify" });
    expect(detailShopifyLink).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/hklunchbox/orders/7808193593617",
    );
    expect(detailShopifyLink.closest(".quote-readonly-order-number")).toBeInTheDocument();
    expect(screen.getByText(/Customer note|客戶備註/)).toBeInTheDocument();
    const famousBrandField = screen.getByText("Customer tags").closest(".quote-readonly-field");
    expect(famousBrandField).not.toBeNull();
    expect(famousBrandField).toHaveTextContent("沙田威爾斯");
    expect(screen.getByText(/Shown on delivery note|送貨單顯示/)).toBeInTheDocument();
    expect(screen.queryByText(/Success probability|成功機率/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sales source|報價渠道/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Communication channel|溝通渠道/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Do not send to factory|不傳送到工場/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send WATI and email order confirmation with add-on link" }));
    await waitFor(() => expect(sendConfirmation).toHaveBeenCalledWith("order-1"));
    const detailSendButton = screen.getByRole("button", { name: /Send to factory|送至工場/ });
    const detailEditLink = screen.getByRole("link", { name: /Edit|編輯/ });
    expect(detailSendButton.closest(".quote-detail-actions")).toBe(detailEditLink.closest(".quote-detail-actions"));
    await user.click(detailSendButton);
    expect(setFactoryStatus).toHaveBeenLastCalledWith("order-1", true);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Send to factory|送至工場/ })).not.toBeInTheDocument());
  });

  it("blocks factory sending from detail and edit pages unless all nine required fields are present", async () => {
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
    expect(detailDialog).toHaveTextContent("Delivery time");
    expect(detailDialog).toHaveTextContent("Dispatch time");
    expect(detailDialog).not.toHaveTextContent("Company name");
    expect(detailDialog).not.toHaveTextContent("Delivery address");
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
    expect(editDialog).toHaveTextContent("Delivery time");
    expect(editDialog).toHaveTextContent("Dispatch time");
    expect(editDialog).not.toHaveTextContent("Company name");
    expect(editDialog).not.toHaveTextContent("Delivery address");
    expect(setFactoryStatus).not.toHaveBeenCalled();
  });

  it("clears the order AO marker after Shopify confirmation but keeps product AO labels", async () => {
    const user = userEvent.setup();
    const confirmAddonShopify = vi.fn().mockResolvedValue(undefined);
    const loadSummary = vi.fn().mockResolvedValue({
      id: "order-addon", orderNumber: "B-1550C", channelId: "channel-1",
      addonShopifyPending: true,
      draft: {
        channelId: "channel-1", customerName: "Customer", companyName: "",
        contactA: "12345678", contactB: "", email: "order@example.com", asanaLink: "",
        address: "1 Central Road", districtId: "district-1", districtName: "", shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-30", deliveryTime: "12:00 - 13:00", shipOutTime: "11:00",
        customerNote: "", packingNote: "", salesPartnerId: "", internalNote: "", tagIds: [],
        quoteStatus: "", quoteSalesSourceId: "", quoteCommunicationChannelId: "",
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [], isSentToFactory: true, doNotSendToFactory: false,
    });
    const loadLines = vi.fn().mockResolvedValue([{
      id: "ao-line", sku: "AO-1", name: "Addon product", quantity: 1,
      unitPrice: 128, totalPrice: 128, remarks: "", isAddon: true,
    }]);

    render(
      <MemoryRouter initialEntries={["/orders/order-addon"]}>
        <Routes>
          <Route path="/orders/:id" element={<QuoteEditorPage documentType="order" combined readOnly canEdit confirmAddonShopify={confirmAddonShopify} loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={loadSummary} loadLines={loadLines} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("未處理加單")).toBeInTheDocument();
    expect(screen.getByText("加單")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认已手动加入 Shopify" }));
    await waitFor(() => expect(confirmAddonShopify).toHaveBeenCalledWith("order-addon"));
    expect(screen.queryByText("未處理加單")).not.toBeInTheDocument();
    expect(screen.getByText("加單")).toBeInTheDocument();
  });

  it("matches an edited product name to its unique SKU and persists the link", async () => {
    const user = userEvent.setup();
    const saveExistingLine = vi.fn().mockResolvedValue(undefined);
    const matchProductsByName = vi.fn().mockResolvedValue([{
      id: "product-new", kind: "product", sku: "NEW-88", name: "New variant", price: 88,
    }]);
    renderEditor({
      loadLines: vi.fn().mockResolvedValue([{
        id: "line-1", productId: "product-old", packageId: null, sku: "OLD-1",
        name: "Old variant", quantity: 1, unitPrice: 88, totalPrice: 88, remarks: null,
      }]),
      saveExistingLine,
      matchProductsByName,
    }, "/quotes/quote-1/edit");

    await user.click(await screen.findByRole("tab", { name: "Add products" }));
    const nameInput = screen.getByRole("textbox", { name: "Product 1" });
    await user.clear(nameInput);
    await user.type(nameInput, "New variant");
    await user.tab();

    await waitFor(() => expect(matchProductsByName).toHaveBeenCalledWith("New variant", "channel-1"));
    await waitFor(() => expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({
      id: "line-1", productId: "product-new", packageId: null, sku: "NEW-88", name: "New variant",
    })));
    expect(screen.getByText("NEW-88")).toBeInTheDocument();
  });

  it("adds a SKU-less detail line to the product catalog and links it back", async () => {
    const user = userEvent.setup();
    const createCatalogProduct = vi.fn().mockResolvedValue("product-created");
    const saveExistingLine = vi.fn().mockResolvedValue(undefined);
    const loadCatalogProductOptions = vi.fn().mockResolvedValue({
      channels: [{ id: "channel-1", name: "Residential" }],
      productTypes: [{ id: "type-1", name: "Main dish" }],
      cookTypes: [], collections: [], packingMaterials: [], packingSupplies: [], catalogIngredients: [],
    });
    const summary = {
      id: "quote-1", orderNumber: "FCLQ20260801", channelId: "channel-1", documentType: "quote" as const,
      draft: { ...emptyQuoteDraft, channelId: "channel-1", customerName: "Customer" },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [],
    };
    render(
      <MemoryRouter initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteEditorPage combined readOnly canEdit canCreateProduct loadOptions={vi.fn().mockResolvedValue(options)} loadSummary={vi.fn().mockResolvedValue(summary)} loadLines={vi.fn().mockResolvedValue([{
            id: "line-1", productId: null, packageId: null, sku: null, name: "Manual variant",
            quantity: 1, unitPrice: 68, totalPrice: 68, remarks: null,
          }])} createCatalogProduct={createCatalogProduct} loadCatalogProductOptions={loadCatalogProductOptions} saveExistingLine={saveExistingLine} loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)} />} />
        </Routes>
      </MemoryRouter>,
    );

    const addToCatalogButton = await screen.findByRole("button", { name: "Add to product catalog" });
    const detailLineRow = addToCatalogButton.closest("tr");
    expect(detailLineRow).not.toBeNull();
    expect(addToCatalogButton.closest("td")).toBe(detailLineRow?.lastElementChild);
    await user.click(addToCatalogButton);
    const panel = await screen.findByRole("dialog", { name: "Add to product catalog" });
    expect(panel).toHaveClass("quote-product-create-panel");
    await user.type(await within(panel).findByLabelText(/^SKU/), "MAN-68");
    await user.selectOptions(within(panel).getByLabelText(/^Category/), "type-1");
    await user.click(within(panel).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createCatalogProduct).toHaveBeenCalledWith(expect.objectContaining({
      name: "Manual variant", sku: "MAN-68", price: 68, channelId: "channel-1", productTypeId: "type-1",
    })));
    await waitFor(() => expect(saveExistingLine).toHaveBeenCalledWith(expect.objectContaining({
      productId: "product-created", sku: "MAN-68", name: "Manual variant",
    })));
    expect(screen.getByText("MAN-68")).toBeInTheDocument();
  });

  it("hides the product catalog action for utensil and beverage lines", async () => {
    const user = userEvent.setup();
    renderEditor({
      canCreateProduct: true,
      loadLines: vi.fn().mockResolvedValue([
        {
          id: "line-utensil", productId: null, packageId: "package-utensil", sku: null,
          name: "Utensil pack", quantity: 1, unitPrice: 0, totalPrice: 0, remarks: null,
        },
        {
          id: "line-beverage", productId: null, packageId: null, sku: null,
          name: "Iced tea", quantity: 1, unitPrice: 18, totalPrice: 18, remarks: null,
        },
      ]),
    }, "/quotes/quote-1/edit");

    await user.click(await screen.findByRole("tab", { name: "Add products" }));
    expect(await screen.findByText("Iced tea")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to product catalog" })).not.toBeInTheDocument();
  });

  it("shows an overpayment when the order total is reduced below recorded payments", async () => {
    const loadSummary = vi.fn().mockResolvedValue({
      id: "order-6942",
      orderNumber: "#6942",
      documentType: "order",
      grandTotal: 2876,
      channelId: "channel-1",
      draft: {
        channelId: "channel-1",
        customerName: "Customer",
        companyName: "Company",
        contactA: "12345678",
        contactB: "",
        email: "order@example.com",
        asanaLink: "",
        address: "1 Central Road",
        districtId: "district-1",
        districtName: "",
        shippingMethodId: "shipping-home",
        deliveryDate: "2026-08-21",
        deliveryTime: "12:00 - 13:00",
        shipOutTime: "11:00",
        customerNote: "",
        packingNote: "",
        salesPartnerId: "",
        internalNote: "",
        tagIds: [],
        quoteStatus: "",
        quoteSalesSourceId: "",
        quoteCommunicationChannelId: "",
      },
      financials: { shippingFee: 0, discount: 0, cashdollarRedeemed: 0, cashdollarPurchased: 0 },
      payments: [{
        id: "payment-1",
        paymentAt: "2026-08-18",
        paymentMethodId: "payme",
        amount: 2916,
        reference: "",
      }],
      isSentToFactory: false,
      doNotSendToFactory: false,
    });

    render(
      <MemoryRouter initialEntries={["/orders/order-6942"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={(
              <QuoteEditorPage
                documentType="order"
                combined
                readOnly
                canEdit
                loadOptions={vi.fn().mockResolvedValue(options)}
                loadSummary={loadSummary}
                loadLines={vi.fn().mockResolvedValue([])}
                loadShippingFeeOptions={vi.fn().mockResolvedValue(shippingFeeOptions)}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "#6942" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /付款狀態：多付/ })).toHaveTextContent("HK$40.00");
    const summary = document.querySelector(".quote-payment-summary");
    expect(summary).not.toBeNull();
    expect(summary).toHaveTextContent("Receivable");
    expect(summary).toHaveTextContent("HK$2,876.00");
    expect(summary).toHaveTextContent("Paid");
    expect(summary).toHaveTextContent("HK$2,916.00");
    expect(summary).toHaveTextContent("Overpaid");
    expect(summary).toHaveTextContent("HK$40.00");
    expect(summary).not.toHaveTextContent("Outstanding");
    expect(summary?.querySelector(".is-overpaid")).not.toBeNull();
  });

  it("puts customer enquiry answers in step 1 before the original quote steps", async () => {
    fetchEnquirySubmission.mockResolvedValue({
      id: "sub-1",
      referenceCode: "ENQ20260903001",
      formId: "form-1",
      createdAt: "2026-09-03T02:00:00.000Z",
      formTitle: "FC Enquiry",
      customerName: "sing",
      salutation: "先生",
      companyName: "www.winepassions.com",
      phone: "95588228",
      email: "cfb.app02@chifung.net",
      deliveryDateRaw: "",
      quoteDescription: "",
      headcount: "",
      internalEmailStatus: "sent",
      internalWatiStatus: "sent",
      ackEmailStatus: "sent",
      asanaStatus: "not_created",
      asanaLink: "",
      formSnapshot: [
        { fieldKey: "name", type: "input", title: "姓名", required: true },
        {
          fieldKey: "title",
          type: "radio",
          title: "稱謂",
          required: true,
          options: [
            { label: "先生", value: "先生" },
            { label: "小姐", value: "小姐" },
          ],
        },
        {
          fieldKey: "formats",
          type: "checkbox",
          title: "有興趣了解的到會形式",
          required: true,
          options: [
            { label: "正餐 到會 (大盤)", value: "meal" },
            { label: "小食 到會 (大盤)", value: "snack" },
          ],
        },
      ],
      answers: { name: "sing", title: "先生", formats: ["meal"] },
      originalAnswers: {},
      convertedQuoteId: "quote-1",
    });

    renderEditor(
      {
        loadSummary: vi.fn().mockResolvedValue({
          id: "quote-1",
          orderNumber: "FCCQ20260902",
          channelId: "channel-1",
          enquirySubmissionId: "sub-1",
        }),
      },
      "/quotes/quote-1/edit",
    );

    expect(await screen.findByRole("tab", { name: "Customer enquiry" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Customer enquiry" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(screen.getByText("Step 3")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Quote details" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Add products" })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("sing")).toBeInTheDocument();
    expect(screen.getByText("先生")).toBeInTheDocument();
    expect(screen.getByText("正餐 到會 (大盤)")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編輯稱謂" })).not.toBeInTheDocument();
    expect(document.querySelector(".enquiry-form-fields-columns")).not.toBeNull();

    const enquiry = document.getElementById("quote-editor-editable-enquiry");
    const details = document.getElementById("quote-editor-editable-details");
    expect(enquiry).not.toBeNull();
    expect(details).not.toBeNull();
    expect(Boolean(
      enquiry
      && details
      && (enquiry.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING),
    )).toBe(true);
  });

  it("opens a pending enquiry with the quote details form and compact choice answers", async () => {
    fetchEnquirySubmission.mockResolvedValue({
      id: "sub-1",
      referenceCode: "ENQ20260903001",
      formId: "form-1",
      createdAt: "2026-09-03T02:00:00.000Z",
      formTitle: "FC Enquiry",
      customerName: "sing",
      salutation: "先生",
      companyName: "www.winepassions.com",
      phone: "95588228",
      email: "cfb.app02@chifung.net",
      deliveryDateRaw: "",
      quoteDescription: "",
      headcount: "",
      internalEmailStatus: "sent",
      internalWatiStatus: "sent",
      ackEmailStatus: "sent",
      asanaStatus: "not_created",
      asanaLink: "",
      formSnapshot: [
        { fieldKey: "name", type: "input", title: "姓名", required: true, quoteField: "customer_name" },
        {
          fieldKey: "title",
          type: "radio",
          title: "稱謂",
          required: true,
          quoteField: "salutation",
          options: [
            { label: "先生", value: "先生" },
            { label: "小姐", value: "小姐" },
          ],
        },
      ],
      answers: { name: "sing", title: "先生" },
      originalAnswers: {},
      convertedQuoteId: null,
    });

    renderEditor({ canEdit: true }, "/quotes/pending/sub-1");

    expect(await screen.findByRole("heading", { name: "ENQ20260903001" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to pending quotes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Customer enquiry" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Quote details" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Add products" })).toBeDisabled();
    expect(screen.getByLabelText(/Brand/)).toBeInTheDocument();
    expect(screen.getByLabelText("Customer name")).toHaveValue("sing");
    expect(screen.getByText("先生")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編輯稱謂" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and add products" })).toBeInTheDocument();
  });

  it("saves pending enquiry answers without converting the enquiry", async () => {
    const user = userEvent.setup();
    fetchEnquirySubmission.mockResolvedValue({
      id: "sub-1",
      referenceCode: "ENQ20260903001",
      formId: "form-1",
      createdAt: "2026-09-03T02:00:00.000Z",
      formTitle: "FC Enquiry",
      customerName: "sing",
      salutation: "",
      companyName: "",
      phone: "95588228",
      email: "cfb.app02@chifung.net",
      deliveryDateRaw: "",
      quoteDescription: "",
      headcount: "",
      internalEmailStatus: "sent",
      internalWatiStatus: "sent",
      ackEmailStatus: "sent",
      asanaStatus: "not_created",
      asanaLink: "",
      formSnapshot: [
        { fieldKey: "name", type: "input", title: "Name", required: true, quoteField: "customer_name" },
      ],
      answers: { name: "sing" },
      originalAnswers: { name: "sing" },
      convertedQuoteId: null,
    });

    renderEditor({ canEdit: true }, "/quotes/pending/sub-1");

    const enquirySection = await screen.findByRole("heading", { name: "Customer enquiry" });
    const section = enquirySection.closest("section");
    expect(section).not.toBeNull();
    await user.click(within(section!).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveEnquirySubmissionAnswers).toHaveBeenCalledWith(
      "sub-1",
      expect.any(Array),
      { name: "sing" },
    ));
    expect(convertEnquiryToQuote).not.toHaveBeenCalled();
  });

  it("converts a pending enquiry into a quote when details are saved", async () => {
    const user = userEvent.setup();
    fetchEnquirySubmission.mockResolvedValue({
      id: "sub-1",
      referenceCode: "ENQ20260903001",
      formId: "form-1",
      createdAt: "2026-09-03T02:00:00.000Z",
      formTitle: "FC Enquiry",
      customerName: "sing",
      salutation: "先生",
      companyName: "",
      phone: "95588228",
      email: "cfb.app02@chifung.net",
      deliveryDateRaw: "2026-10-01",
      quoteDescription: "",
      headcount: "",
      internalEmailStatus: "sent",
      internalWatiStatus: "sent",
      ackEmailStatus: "sent",
      asanaStatus: "not_created",
      asanaLink: "",
      formSnapshot: [
        { fieldKey: "name", type: "input", title: "姓名", required: true, quoteField: "customer_name" },
        { fieldKey: "phone", type: "input", title: "電話", required: true, quoteField: "phone" },
        { fieldKey: "email", type: "input", title: "電郵", required: true, quoteField: "email" },
        { fieldKey: "date", type: "date", title: "日期", required: false, quoteField: "delivery_date" },
      ],
      answers: {
        name: "sing",
        phone: "95588228",
        email: "cfb.app02@chifung.net",
        date: "2026-10-01",
      },
      originalAnswers: {},
      convertedQuoteId: null,
    });
    const saveDetails = vi.fn().mockResolvedValue(undefined);
    renderEditor({ canEdit: true, saveDetails }, "/quotes/pending/sub-1");

    expect(await screen.findByRole("heading", { name: "ENQ20260903001" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Brand/), "channel-1");
    await user.selectOptions(screen.getByLabelText("Shipping method"), "shipping-home");
    await user.click(screen.getByRole("combobox", { name: "District" }));
    await user.click(screen.getByRole("option", { name: "Central" }));
    await user.click(screen.getByRole("button", { name: "Save and add products" }));

    await waitFor(() => {
      expect(saveEnquirySubmissionAnswers).toHaveBeenCalledWith(
        "sub-1",
        expect.any(Array),
        expect.objectContaining({ name: "sing" }),
      );
      expect(convertEnquiryToQuote).toHaveBeenCalledWith({
        submissionId: "sub-1",
        channelId: "channel-1",
        draft: expect.objectContaining({
          customerName: "sing",
          contactA: "95588228",
          email: "cfb.app02@chifung.net",
          deliveryDate: "2026-10-01",
        }),
      });
      expect(saveDetails).not.toHaveBeenCalled();
    });
  });
});
