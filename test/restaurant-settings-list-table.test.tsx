import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";

function SettingsTable() {
  return (
    <RestaurantSettingsListTable
      header={
        <tr>
          <th>Name</th>
          <th>Notes</th>
        </tr>
      }
      loading={false}
      loadingLabel="Loading"
      skeletonColumns={2}
      toolbarAction={<button type="button">Add setting</button>}
    >
      <tr>
        <td>Restaurant Alpha</td>
        <td>Primary location</td>
      </tr>
      <tr>
        <td>Restaurant Beta</td>
        <td>Secondary location</td>
      </tr>
    </RestaurantSettingsListTable>
  );
}

describe("RestaurantSettingsListTable", () => {
  it("places the action beside the shared search field", () => {
    render(<SettingsTable />);

    const toolbar = screen.getByRole("searchbox", {
      name: "搜尋設定項目",
    }).closest(".restaurant-settings-toolbar");

    expect(toolbar).not.toBeNull();
    expect(toolbar).toContainElement(
      screen.getByRole("button", { name: "Add setting" }),
    );
  });

  it("filters rendered rows and shows the centered empty state", async () => {
    const user = userEvent.setup();
    render(<SettingsTable />);

    const search = screen.getByRole("searchbox", {
      name: "搜尋設定項目",
    });
    await user.type(search, "Beta");
    await waitFor(() => {
      expect(screen.queryByText("Restaurant Alpha")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Restaurant Beta")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "Missing setting");
    await waitFor(() => {
      expect(screen.getByText("找不到符合的設定項目")).toBeInTheDocument();
    });
    expect(screen.getByText("顯示 0–0，共 0 筆")).toBeInTheDocument();
  });
});
