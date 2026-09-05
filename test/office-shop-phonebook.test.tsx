import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfficeShopPhonebookPage } from "@/components/OfficeShopOrderingPages";
import * as shopOrders from "@/lib/shop-orders";
import type { SupplierRow } from "@/lib/suppliers";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

vi.mock("@/lib/shop-orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/shop-orders")>(
    "@/lib/shop-orders",
  );
  return {
    ...actual,
    fetchShopSupplierRecords: vi.fn(),
    fetchAllShopContacts: vi.fn(),
    createShopSupplierContact: vi.fn(),
    updateShopSupplierContact: vi.fn(),
  };
});

function supplier(
  id: string,
  companyName: string,
  phoneNumber: string | null,
): SupplierRow {
  return {
    id,
    companyName,
    contactPerson: null,
    phoneNumber,
    deliverySchedule: null,
    paymentSchedule: null,
    comment: null,
    isActive: true,
    cateringIngredients: [],
    rawMeatItems: [],
    restaurantIngredients: [],
    orderingGroups: [],
    createdAt: "2026-09-05T00:00:00Z",
  };
}

describe("OfficeShopPhonebookPage", () => {
  beforeEach(() => {
    vi.mocked(shopOrders.fetchShopSupplierRecords).mockResolvedValue([
      supplier("supplier-a", "供應商甲", "6123 4567"),
      supplier("supplier-b", "供應商乙", null),
      supplier("supplier-c", "供應商丙", null),
    ]);
    vi.mocked(shopOrders.fetchAllShopContacts).mockResolvedValue([
      {
        id: "contact-c",
        supplierId: "supplier-c",
        name: "陳先生",
        phone: "98765432",
        note: null,
      },
    ]);
    vi.mocked(shopOrders.createShopSupplierContact).mockImplementation(
      async (input) => ({
        id: "created-contact",
        supplierId: input.supplierId,
        name: input.name || null,
        phone: input.phone,
        note: input.note || null,
      }),
    );
    vi.mocked(shopOrders.updateShopSupplierContact).mockImplementation(
      async (contactId, input) => ({
        id: contactId,
        supplierId: input.supplierId,
        name: input.name || null,
        phone: input.phone,
        note: input.note || null,
      }),
    );
  });

  it("shows every supplier and only enables contact actions for usable phone numbers", async () => {
    render(<OfficeShopPhonebookPage />);

    await waitFor(() => {
      expect(screen.getByText("供應商甲")).toBeInTheDocument();
    });
    expect(screen.getByText("供應商乙")).toBeInTheDocument();
    expect(screen.getByText("供應商丙")).toBeInTheDocument();

    const masterPhoneRow = screen.getByText("供應商甲").closest("tr");
    expect(masterPhoneRow).not.toBeNull();
    expect(
      masterPhoneRow?.querySelector(
        'a[href="whatsapp://call?number=85261234567"]',
      ),
    ).not.toBeNull();
    expect(
      masterPhoneRow?.querySelector('a[href="tel:+85261234567"]'),
    ).not.toBeNull();

    const noPhoneRow = screen.getByText("供應商乙").closest("tr");
    expect(noPhoneRow).not.toBeNull();
    expect(within(noPhoneRow!).getAllByRole("button")).toHaveLength(3);
    expect(
      within(noPhoneRow!)
        .getAllByRole("button")
        .filter((button) => button.hasAttribute("disabled")),
    ).toHaveLength(2);

    const contactRow = screen.getByText("供應商丙").closest("tr");
    expect(
      contactRow?.querySelector(
        'a[href="whatsapp://call?number=85298765432"]',
      ),
    ).not.toBeNull();
    expect(screen.getByText("陳先生")).toBeInTheDocument();
  });

  it("creates a contact for a supplier without a phone and edits an existing contact", async () => {
    const user = userEvent.setup();
    render(<OfficeShopPhonebookPage />);

    await user.click(await screen.findByRole("button", { name: "新增聯絡人" }));
    const addDialog = screen.getByRole("dialog", { name: "新增供應商聯絡人" });
    await user.click(within(addDialog).getByRole("combobox", { name: "供應商" }));
    await user.click(screen.getAllByRole("option")[1]);
    await user.type(within(addDialog).getByLabelText("聯絡人"), "李小姐");
    await user.type(within(addDialog).getByLabelText("電話"), "6234 5678");
    await user.type(within(addDialog).getByLabelText("備註"), "下午聯絡");
    await user.click(within(addDialog).getByRole("button", { name: "儲存" }));

    await waitFor(() => {
      expect(shopOrders.createShopSupplierContact).toHaveBeenCalledWith({
        supplierId: "supplier-b",
        name: "李小姐",
        phone: "6234 5678",
        note: "下午聯絡",
      });
    });
    expect(screen.getByText("李小姐")).toBeInTheDocument();

    const existingRow = screen.getByText("供應商丙").closest("tr");
    await user.click(
      within(existingRow!).getByRole("button", {
        name: "編輯 供應商丙 聯絡資料",
      }),
    );
    const editDialog = screen.getByRole("dialog", { name: "編輯供應商聯絡人" });
    const phoneInput = within(editDialog).getByLabelText("電話");
    await user.clear(phoneInput);
    await user.type(phoneInput, "91234567");
    await user.click(within(editDialog).getByRole("button", { name: "儲存" }));

    await waitFor(() => {
      expect(shopOrders.updateShopSupplierContact).toHaveBeenCalledWith(
        "contact-c",
        expect.objectContaining({ phone: "91234567" }),
      );
    });
  });
});
