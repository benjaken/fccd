import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeliveryDistrictsPage } from "@/components/settings/DeliveryDistrictsPage";
import i18n from "@/i18n";
import { groupDeliveryDistrictRows } from "@/lib/delivery-districts";

vi.mock("@/auth/use-page-access", async () => {
  const actual = await vi.importActual<typeof import("@/auth/use-page-access")>(
    "@/auth/use-page-access",
  );
  return {
    ...actual,
    useCurrentPageAccess: () => ({
      canAccess: () => true,
      canManage: () => true,
      loading: false,
      error: null,
      pageKey: "settings.districts",
    }),
  };
});

const district = {
  id: "district-1",
  ids: ["district-1", "district-duplicate"],
  name: "中環",
};

describe("DeliveryDistrictsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows and creates district names only", async () => {
    const user = userEvent.setup();
    const createDistrict = vi.fn().mockResolvedValue(undefined);
    const loadDistricts = vi.fn().mockResolvedValue({ items: [district], total: 1 });

    render(
      <DeliveryDistrictsPage
        loadDistricts={loadDistricts}
        createDistrict={createDistrict}
      />,
    );

    expect(await screen.findByRole("heading", { name: "地區管理" })).toBeInTheDocument();
    expect(await screen.findByText("中環")).toBeInTheDocument();
    expect(screen.queryByText("預設送貨費")).not.toBeInTheDocument();
    expect(screen.queryByText("預設車隊")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增地區" }));
    const panel = screen.getByRole("dialog", { name: "新增地區" });
    await user.type(within(panel).getByLabelText("地區名稱"), "銅鑼灣");
    await user.click(within(panel).getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(createDistrict).toHaveBeenCalledWith({ name: "銅鑼灣" }));
  });

  it("archives a district without deleting historical records", async () => {
    const user = userEvent.setup();
    const archiveDistrict = vi.fn().mockResolvedValue(undefined);
    render(
      <DeliveryDistrictsPage
        loadDistricts={vi.fn().mockResolvedValue({ items: [district], total: 1 })}
        archiveDistrict={archiveDistrict}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "停用地區" }));
    const dialog = screen.getByRole("alertdialog", { name: "停用地區" });
    expect(within(dialog).getByText(/既有訂單資料會保留/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "確認停用" }));
    await waitFor(() => expect(archiveDistrict).toHaveBeenCalledWith(["district-1", "district-duplicate"]));
  });

  it("deduplicates district names and retains all matching record ids", () => {
    expect(groupDeliveryDistrictRows([
      { id: "district-1", name: "中環" },
      { id: "district-2", name: "  中環  " },
      { id: "district-3", name: "Central" },
      { id: "district-4", name: "central" },
    ])).toEqual([
      { id: "district-1", ids: ["district-1", "district-2"], name: "中環" },
      { id: "district-3", ids: ["district-3", "district-4"], name: "Central" },
    ]);
  });
});
