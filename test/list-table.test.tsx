import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ListTable } from "@/components/ui/list-table";

const OPERATIONAL_LIST_PAGES = [
  "src/components/OrdersListPage.tsx",
  "src/components/QuotesListPage.tsx",
  "src/components/PaymentsListPage.tsx",
  "src/components/MeatYieldErrorsPage.tsx",
  "src/components/ProductsListPage.tsx",
  "src/components/PackagesListPage.tsx",
  "src/components/settings/UsersListPage.tsx",
  "src/components/settings/LoginLogsListPage.tsx",
  "src/components/settings/AttachmentsListPage.tsx",
];

describe("ListTable", () => {
  it("keeps the table shell visible and swaps skeleton rows for data", () => {
    const { rerender } = render(
      <ListTable
        loading
        loadingLabel="正在載入"
        skeletonRows={3}
        skeletonColumns={[{ width: "70%" }, { width: "5rem" }]}
        header={
          <tr>
            <th>名稱</th>
            <th>狀態</th>
          </tr>
        }
      >
        <tr>
          <td>測試資料</td>
          <td>啟用</td>
        </tr>
      </ListTable>,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在載入");
    expect(document.querySelectorAll(".table-skeleton-row")).toHaveLength(3);
    expect(screen.queryByText("測試資料")).not.toBeInTheDocument();

    rerender(
      <ListTable
        loading={false}
        loadingLabel="正在載入"
        skeletonRows={3}
        skeletonColumns={2}
        header={
          <tr>
            <th>名稱</th>
            <th>狀態</th>
          </tr>
        }
      >
        <tr>
          <td>測試資料</td>
          <td>啟用</td>
        </tr>
      </ListTable>,
    );

    expect(document.querySelectorAll(".table-skeleton-row")).toHaveLength(0);
    expect(screen.getByText("測試資料")).toBeInTheDocument();
  });

  it.each(OPERATIONAL_LIST_PAGES)(
    "is the shared table shell for %s",
    (relativePath) => {
      const source = readFileSync(
        path.resolve(process.cwd(), relativePath),
        "utf8",
      );

      expect(source).toContain(
        'import { ListTable } from "@/components/ui/list-table";',
      );
      expect(source).toContain("<ListTable");
      expect(source).toContain("onRefresh=");
    },
  );
});
