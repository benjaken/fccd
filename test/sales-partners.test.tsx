import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SalesPartnersPage } from "@/components/SalesPartnersPage";
import i18n from "@/i18n";
import {
  filterSalesPartners,
  isMissingArchivedAtColumn,
  type SalesPartnerRow,
} from "@/lib/sales-partners";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const rows: SalesPartnerRow[] = [
  {
    id: "sp-1",
    name: "陳大文",
    phone: "9123 4567",
    createdAt: "2024-03-21T00:00:00.000Z",
  },
  {
    id: "sp-2",
    name: "李小明",
    phone: "9876 5432",
    createdAt: "2024-04-02T00:00:00.000Z",
  },
];

describe("filterSalesPartners", () => {
  it("filters by name or phone", () => {
    expect(
      filterSalesPartners(rows, { search: "陳" }).map((row) => row.id),
    ).toEqual(["sp-1"]);
    expect(
      filterSalesPartners(rows, { search: "9876" }).map((row) => row.id),
    ).toEqual(["sp-2"]);
  });
});

describe("isMissingArchivedAtColumn", () => {
  it("detects a missing archive column so migrated rows can still load", () => {
    expect(
      isMissingArchivedAtColumn({
        code: "42703",
        message: 'column sales_partners.archived_at does not exist',
      }),
    ).toBe(true);
    expect(
      isMissingArchivedAtColumn({
        message: "Could not find the 'archived_at' column of 'sales_partners' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingArchivedAtColumn({ message: "permission denied" })).toBe(
      false,
    );
  });
});

describe("Sale Partner page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists partners and filters from the search bar", async () => {
    const user = userEvent.setup();
    const loadPartners = vi
      .fn()
      .mockImplementation(async (filters = {}) =>
        filterSalesPartners(structuredClone(rows), filters),
      );

    render(
      <MemoryRouter>
        <SalesPartnersPage loadPartners={loadPartners} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Sale Partner" }),
    ).toBeInTheDocument();
    expect(screen.getByText("陳大文")).toBeInTheDocument();
    expect(screen.getByText("李小明")).toBeInTheDocument();
    expect(screen.getByText("9123 4567")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("搜尋姓名或電話"), "李小明");
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() => {
      expect(loadPartners).toHaveBeenLastCalledWith({ search: "李小明" });
    });

    expect(await screen.findByText("李小明")).toBeInTheDocument();
    expect(screen.queryByText("陳大文")).not.toBeInTheDocument();
  });

  it("opens the create panel and adds a partner", async () => {
    const user = userEvent.setup();
    const loadPartners = vi.fn().mockResolvedValue(structuredClone(rows));
    const createPartner = vi.fn().mockResolvedValue({
      id: "sp-3",
      name: "王美玲",
      phone: "6111 2222",
      createdAt: "2024-05-01T00:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <SalesPartnersPage
          loadPartners={loadPartners}
          createPartner={createPartner}
        />
      </MemoryRouter>,
    );

    await screen.findByText("陳大文");
    await user.click(screen.getByRole("button", { name: "新建" }));

    await screen.findByRole("dialog", { name: "新增 Sale Partner" });
    await user.type(screen.getByPlaceholderText("輸入姓名"), "王美玲");
    await user.type(screen.getByPlaceholderText("輸入電話"), "6111 2222");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createPartner).toHaveBeenCalledWith({
        name: "王美玲",
        phone: "6111 2222",
      });
    });

    expect(await screen.findByText("王美玲")).toBeInTheDocument();
  });

  it("requires name and phone before saving", async () => {
    const user = userEvent.setup();
    const createPartner = vi.fn();

    render(
      <MemoryRouter>
        <SalesPartnersPage
          loadPartners={vi.fn().mockResolvedValue([])}
          createPartner={createPartner}
        />
      </MemoryRouter>,
    );

    await user.click((await screen.findAllByRole("button", { name: "新建" }))[0]!);
    await screen.findByRole("dialog", { name: "新增 Sale Partner" });
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("請輸入姓名")).toBeInTheDocument();
    expect(screen.getByText("請輸入電話")).toBeInTheDocument();
    expect(createPartner).not.toHaveBeenCalled();
  });

  it("opens the edit panel and updates a partner", async () => {
    const user = userEvent.setup();
    const loadPartners = vi.fn().mockResolvedValue(structuredClone(rows));
    const updatePartner = vi.fn().mockResolvedValue({
      ...rows[0],
      name: "陳大文改",
      phone: "9000 0000",
    });

    render(
      <MemoryRouter>
        <SalesPartnersPage
          loadPartners={loadPartners}
          updatePartner={updatePartner}
        />
      </MemoryRouter>,
    );

    await screen.findByText("陳大文");
    await user.click(screen.getAllByRole("button", { name: "編輯" })[0]!);

    await screen.findByRole("dialog", { name: "編輯 Sale Partner" });
    const nameInput = screen.getByPlaceholderText("輸入姓名");
    expect(nameInput).toHaveValue("陳大文");
    expect(screen.getByPlaceholderText("輸入電話")).toHaveValue("9123 4567");

    await user.clear(nameInput);
    await user.type(nameInput, "陳大文改");
    const phoneInput = screen.getByPlaceholderText("輸入電話");
    await user.clear(phoneInput);
    await user.type(phoneInput, "9000 0000");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updatePartner).toHaveBeenCalledWith("sp-1", {
        name: "陳大文改",
        phone: "9000 0000",
      });
    });

    expect(await screen.findByText("陳大文改")).toBeInTheDocument();
    expect(screen.queryByText("陳大文")).not.toBeInTheDocument();
    expect(screen.getByText("李小明")).toBeInTheDocument();
  });

  it("hides create, edit, and delete without action permission", async () => {
    render(
      <MemoryRouter>
        <SalesPartnersPage
          loadPartners={vi.fn().mockResolvedValue(structuredClone(rows))}
          canCreate={false}
          canEdit={false}
          canDelete={false}
        />
      </MemoryRouter>,
    );

    await screen.findByText("陳大文");
    expect(screen.queryByRole("button", { name: "新建" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編輯" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刪除" })).not.toBeInTheDocument();
  });

  it("deletes a partner after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadPartners = vi.fn().mockResolvedValue(structuredClone(rows));
    const deletePartner = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SalesPartnersPage
          loadPartners={loadPartners}
          deletePartner={deletePartner}
        />
      </MemoryRouter>,
    );

    await screen.findByText("陳大文");
    await user.click(screen.getAllByRole("button", { name: "刪除" })[0]!);

    await waitFor(() => {
      expect(deletePartner).toHaveBeenCalledWith("sp-1");
    });
    expect(screen.queryByText("陳大文")).not.toBeInTheDocument();
    expect(screen.getByText("李小明")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
