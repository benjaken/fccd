import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MeatCustomersPage } from "@/components/MeatCustomersPage";
import i18n from "@/i18n";
import {
  filterMeatCustomers,
  type MeatCustomerRow,
} from "@/lib/meat-customers";

const rows: MeatCustomerRow[] = [
  {
    id: "c-1",
    customerCode: "C0085",
    name: "桂花小幸 YLP",
    contactPerson: "阿國 / 懷哥",
    phone: "9899 1980 / 5743 2960",
    address: "元朗青山公路元朗段251號元朗廣場地下3號 & 5號舖",
    deliveryNoteRequired: false,
  },
  {
    id: "c-2",
    customerCode: "C0022",
    name: "桂花小幸 TKO",
    contactPerson: "李振聲",
    phone: "9742 3619",
    address: "將軍澳唐德街1號將軍澳廣場1樓133-135號舖",
    deliveryNoteRequired: false,
  },
];

describe("filterMeatCustomers", () => {
  it("filters by customer code, name, phone, and free search", () => {
    expect(
      filterMeatCustomers(rows, { customerCode: "C0022" }).map((row) => row.id),
    ).toEqual(["c-2"]);
    expect(
      filterMeatCustomers(rows, { name: "YLP" }).map((row) => row.id),
    ).toEqual(["c-1"]);
    expect(
      filterMeatCustomers(rows, { phone: "9742" }).map((row) => row.id),
    ).toEqual(["c-2"]);
    expect(
      filterMeatCustomers(rows, { search: "元朗" }).map((row) => row.id),
    ).toEqual(["c-1"]);
  });
});

describe("Meat customers page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists customers and filters from the search bar", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi
      .fn()
      .mockImplementation(async (filters = {}) =>
        filterMeatCustomers(structuredClone(rows), filters),
      );

    render(
      <MemoryRouter>
        <MeatCustomersPage loadCustomers={loadCustomers} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "客戶" })).toBeInTheDocument();
    expect(screen.getByText("桂花小幸 YLP")).toBeInTheDocument();
    expect(screen.getByText("桂花小幸 TKO")).toBeInTheDocument();
    expect(screen.queryByLabelText("客人編號")).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("搜尋客人編號、名稱、聯絡人、電話或地址"),
      "C0022",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() => {
      expect(loadCustomers).toHaveBeenLastCalledWith({
        search: "C0022",
      });
    });

    expect(await screen.findByText("桂花小幸 TKO")).toBeInTheDocument();
    expect(screen.queryByText("桂花小幸 YLP")).not.toBeInTheDocument();
  });

  it("opens the create panel and adds a customer", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi.fn().mockResolvedValue(structuredClone(rows));
    const createCustomer = vi.fn().mockResolvedValue({
      id: "c-3",
      customerCode: "C0099",
      name: "測試客人",
      contactPerson: "阿明",
      phone: "9123 4567",
      address: "測試地址",
      deliveryNoteRequired: false,
    });

    render(
      <MemoryRouter>
        <MeatCustomersPage
          loadCustomers={loadCustomers}
          createCustomer={createCustomer}
        />
      </MemoryRouter>,
    );

    await screen.findByText("桂花小幸 YLP");
    await user.click(screen.getByRole("button", { name: "新建" }));

    await screen.findByRole("dialog", { name: "新增客戶" });
    await user.type(screen.getByPlaceholderText("例如：C0085"), "C0099");
    await user.type(screen.getByPlaceholderText("例如：桂花小幸 YLP"), "測試客人");
    await user.type(screen.getByPlaceholderText("聯絡人姓名"), "阿明");
    await user.type(screen.getByPlaceholderText("電話號碼"), "9123 4567");
    await user.type(screen.getByPlaceholderText("送貨或店鋪地址"), "測試地址");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createCustomer).toHaveBeenCalledWith({
        customerCode: "C0099",
        name: "測試客人",
        contactPerson: "阿明",
        phone: "9123 4567",
        address: "測試地址",
      });
    });

    expect(await screen.findByText("測試客人")).toBeInTheDocument();
  });

  it("opens the edit panel and updates a customer", async () => {
    const user = userEvent.setup();
    const loadCustomers = vi.fn().mockResolvedValue(structuredClone(rows));
    const updateCustomer = vi.fn().mockResolvedValue({
      ...rows[0],
      name: "桂花小幸 YLP 改",
      phone: "9123 0000",
    });

    render(
      <MemoryRouter>
        <MeatCustomersPage
          loadCustomers={loadCustomers}
          updateCustomer={updateCustomer}
        />
      </MemoryRouter>,
    );

    await screen.findByText("桂花小幸 YLP");
    await user.click(screen.getAllByRole("button", { name: "編輯" })[0]!);

    await screen.findByRole("dialog", { name: "編輯客戶" });
    const nameInput = screen.getByPlaceholderText("例如：桂花小幸 YLP");
    expect(nameInput).toHaveValue("桂花小幸 YLP");
    expect(screen.getByPlaceholderText("例如：C0085")).toHaveValue("C0085");

    await user.clear(nameInput);
    await user.type(nameInput, "桂花小幸 YLP 改");
    const phoneInput = screen.getByPlaceholderText("電話號碼");
    await user.clear(phoneInput);
    await user.type(phoneInput, "9123 0000");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith("c-1", {
        customerCode: "C0085",
        name: "桂花小幸 YLP 改",
        contactPerson: "阿國 / 懷哥",
        phone: "9123 0000",
        address: "元朗青山公路元朗段251號元朗廣場地下3號 & 5號舖",
      });
    });

    expect(await screen.findByText("桂花小幸 YLP 改")).toBeInTheDocument();
    expect(screen.queryByText("桂花小幸 YLP")).not.toBeInTheDocument();
    expect(screen.getByText("桂花小幸 TKO")).toBeInTheDocument();
  });

  it("deletes a customer after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadCustomers = vi.fn().mockResolvedValue(structuredClone(rows));
    const deleteCustomer = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <MeatCustomersPage
          loadCustomers={loadCustomers}
          deleteCustomer={deleteCustomer}
        />
      </MemoryRouter>,
    );

    await screen.findByText("桂花小幸 YLP");
    await user.click(screen.getAllByRole("button", { name: "刪除" })[0]!);

    await waitFor(() => {
      expect(deleteCustomer).toHaveBeenCalledWith("c-1");
    });
    expect(screen.queryByText("桂花小幸 YLP")).not.toBeInTheDocument();
    expect(screen.getByText("桂花小幸 TKO")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
