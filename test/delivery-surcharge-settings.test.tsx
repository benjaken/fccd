import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeliverySurchargeTypesPage } from "@/components/DeliverySurchargeTypesPage";
import i18n from "@/i18n";
import {
  filterDeliverySurchargeTypes,
  type DeliverySurchargeType,
} from "@/lib/delivery-surcharge-types";

vi.mock("@/auth/use-page-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/use-page-access")>()),
  useCurrentPageAccess: () => ({
    loading: false,
    error: null,
    canAccess: () => true,
    canManage: () => true,
    canAccessSection: () => true,
  }),
}));

const surchargeTypes: DeliverySurchargeType[] = [
  {
    id: "surcharge-1",
    name: "節日附加費",
    isActive: false,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "surcharge-2",
    name: "隧道費",
    isActive: true,
    createdAt: "2024-01-02T00:00:00.000Z",
  },
];

describe("delivery surcharge settings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists surcharge categories and their active state", async () => {
    render(
      <DeliverySurchargeTypesPage
        loadTypes={vi.fn().mockResolvedValue(structuredClone(surchargeTypes))}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "送貨附加費" }),
    ).toBeInTheDocument();
    const table = within(await screen.findByRole("table"));
    expect(
      table.getByRole("columnheader", { name: "附加費類別" }),
    ).toBeInTheDocument();
    expect(table.getByText("節日附加費")).toBeInTheDocument();
    expect(table.getByText("隧道費")).toBeInTheDocument();
    expect(
      table.getByRole("switch", { name: "切換 節日附加費 的啟用狀態" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("creates, searches and modifies surcharge categories", async () => {
    const user = userEvent.setup();
    const createType = vi.fn().mockResolvedValue({
      id: "surcharge-3",
      name: "停車場費",
      isActive: true,
      createdAt: "2024-01-03T00:00:00.000Z",
    });
    const updateType = vi.fn().mockResolvedValue({
      ...surchargeTypes[1],
      isActive: false,
    });
    render(
      <DeliverySurchargeTypesPage
        loadTypes={vi.fn().mockResolvedValue(structuredClone(surchargeTypes))}
        createType={createType}
        updateType={updateType}
      />,
    );

    await screen.findByText("隧道費");
    expect(filterDeliverySurchargeTypes(surchargeTypes, "隧道")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "新增" }));
    const panel = await screen.findByRole("dialog", { name: "新增送貨附加費" });
    await user.type(within(panel).getByLabelText("附加費類別"), "停車場費");
    await user.click(within(panel).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(createType).toHaveBeenCalledWith({
        name: "停車場費",
        isActive: true,
      });
    });

    await user.click(
      screen.getByRole("switch", { name: "切換 隧道費 的啟用狀態" }),
    );
    await waitFor(() => {
      expect(updateType).toHaveBeenCalledWith("surcharge-2", {
        isActive: false,
      });
    });
  });
});
