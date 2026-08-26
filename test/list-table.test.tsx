import { readFileSync } from "node:fs";
import path from "node:path";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { ListTable } from "@/components/ui/list-table";

const OPERATIONAL_LIST_PAGES = [
  "src/components/OrdersListPage.tsx",
  "src/components/QuotesListPage.tsx",
  "src/components/QuoteCustomersPage.tsx",
  "src/components/PaymentsListPage.tsx",
  "src/components/MeatYieldErrorsPage.tsx",
  "src/components/ProductsListPage.tsx",
  "src/components/PackagesListPage.tsx",
  "src/components/settings/UsersListPage.tsx",
  "src/components/settings/LoginLogsListPage.tsx",
  "src/components/settings/AttachmentsListPage.tsx",
];

describe("ListTable", () => {
  it("leaves vertical wheel scrolling to the page", () => {
    const css = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const operationalRule = css.match(/\.operational-table-wrap\s*\{([^}]*)\}/)?.[1];
    const pullToRefreshRule = css.match(/\.pull-to-refresh\s*\{([^}]*)\}/)?.[1];

    expect(operationalRule).toBeDefined();
    expect(operationalRule).toContain("overflow-x: auto");
    expect(operationalRule).not.toMatch(/(?:^|[;\s])overflow:\s*auto/);
    expect(pullToRefreshRule).toBeDefined();
    expect(pullToRefreshRule).not.toContain("overscroll-behavior-y: contain");
  });

  it("lets mobile order cards use page scrolling without an outer panel", () => {
    const css = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const pageRule = css.match(
      /\.orders-page:has\(\.responsive-card-list-panel\)\s*\{([^}]*)\}/,
    )?.[1];
    const panelRule = css.match(
      /\.orders-panel\.responsive-card-list-panel\s*\{([^}]*)\}/,
    )?.[1];
    const toolbarRule = css.match(
      /\.orders-panel\.responsive-card-list-panel\s*>\s*\.orders-toolbar\s*\{([^}]*)\}/,
    )?.[1];
    const listRule = css.match(
      /\.orders-panel\.responsive-card-list-panel\s+\.orders-table-wrap\.has-mobile-list\s*\{([^}]*)\}/,
    )?.[1];

    expect(pageRule).toContain("height: auto");
    expect(pageRule).toContain("min-height: 0");
    expect(pageRule).toContain("overflow: visible");
    expect(panelRule).toContain("border: 0");
    expect(panelRule).toContain("background: transparent");
    expect(panelRule).toContain("box-shadow: none");
    expect(panelRule).toContain("overflow: visible");
    expect(toolbarRule).toContain("padding: 0");
    expect(toolbarRule).toContain("border: 0");
    expect(toolbarRule).toContain("background: transparent");
    expect(listRule).toContain("overflow: visible");
  });

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

  it("marks action skeleton cells for the shared sticky action column", () => {
    render(
      <ListTable
        loading
        loadingLabel="正在載入"
        skeletonRows={1}
        skeletonColumns={[
          { width: "70%" },
          { width: "4rem", variant: "action" },
        ]}
        header={
          <tr>
            <th>名稱</th>
            <th aria-label="操作" />
          </tr>
        }
      >
        <tr>
          <td>測試資料</td>
          <td className="table-actions-cell">操作</td>
        </tr>
      </ListTable>,
    );

    expect(screen.getAllByRole("cell")[1]).toHaveClass("table-actions-cell");
  });

  it("keeps trailing action columns sticky in horizontally scrolling tables", () => {
    const css = readFileSync(
      path.resolve(process.cwd(), "src/components/ui/table-actions.css"),
      "utf8",
    );

    expect(css).toContain(".table-wrap:has(");
    expect(css).toContain('th[aria-label*="action" i]');
    expect(css).toContain("inset-inline-end: 0;");
    expect(css).toContain("box-shadow: -1px 0 0 var(--border);");
  });

  it("automatically loads more mobile cards without showing a next-page button", () => {
    const loadMore = vi.fn();
    let notifyIntersection: IntersectionObserverCallback = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserverMock {
        constructor(callback: IntersectionObserverCallback) {
          notifyIntersection = callback;
        }

        observe = observe;
        disconnect = disconnect;
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
        root = null;
        rootMargin = "180px 0px";
        thresholds = [0];
      },
    );

    const { rerender } = render(
      <ListTable
        loading={false}
        loadingLabel="Loading"
        skeletonColumns={1}
        header={<tr><th>Name</th></tr>}
        mobileContent={<div role="list"><article role="listitem">Mobile record</article></div>}
        mobileHasMore
        onMobileLoadMore={loadMore}
        mobileEndLabel="All records loaded"
      >
        <tr><td>Desktop record</td></tr>
      </ListTable>,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("Mobile record");
    expect(screen.queryByRole("button", { name: /load more|next page/i })).not.toBeInTheDocument();
    expect(observe).toHaveBeenCalledTimes(1);

    act(() => {
      notifyIntersection(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender(
      <ListTable
        loading={false}
        loadingLabel="Loading"
        skeletonColumns={1}
        header={<tr><th>Name</th></tr>}
        mobileContent={<div role="list"><article role="listitem">Mobile record</article></div>}
        mobileEndLabel="All records loaded"
      >
        <tr><td>Desktop record</td></tr>
      </ListTable>,
    );
    expect(screen.getByText("All records loaded")).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
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
