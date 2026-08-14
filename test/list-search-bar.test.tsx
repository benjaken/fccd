import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListSearchBar } from "@/components/ui/list-search-bar";

const FILTERED_LIST_PAGES = [
  "src/components/OrdersListPage.tsx",
  "src/components/QuotesListPage.tsx",
  "src/components/ProductsListPage.tsx",
  "src/components/PackagesListPage.tsx",
  "src/components/MeatYieldErrorsPage.tsx",
  "src/components/settings/UsersListPage.tsx",
  "src/components/settings/LoginLogsListPage.tsx",
  "src/components/settings/AttachmentsListPage.tsx",
];

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
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

const filters = (
  <label>
    售價範圍
    <select aria-label="售價範圍">
      <option value="">全部售價</option>
      <option value="under-100">100 以下</option>
    </select>
  </label>
);

describe("ListSearchBar", () => {
  afterEach(() => {
    mockMatchMedia(false);
  });

  it("keeps the search icon inside the field and submits the trimmed action", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { container } = render(
      <ListSearchBar
        id="unit-list-search"
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        label="搜尋訂單"
        placeholder="訂單號或客戶"
        submitLabel="搜尋"
      />,
    );

    const field = container.querySelector(".search-field");
    expect(field).not.toBeNull();
    expect(field?.querySelector("svg")).not.toBeNull();

    const input = screen.getByRole("searchbox", { name: "搜尋訂單" });
    expect(input).toBe(field?.querySelector("input"));

    await user.type(input, "B-1513");
    expect(onChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "搜尋" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits when Enter is pressed in the field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ListSearchBar
        id="unit-list-search-enter"
        value="ready"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        label="搜尋"
        submitLabel="搜尋"
      />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: "搜尋" }),
      "{Enter}",
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps filters inline on desktop", () => {
    mockMatchMedia(false);

    render(
      <ListSearchBar
        id="unit-list-search-desktop-filters"
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        label="搜尋商品"
        submitLabel="搜尋"
        filters={filters}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "搜尋商品" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "售價範圍" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "開啟篩選" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確定" })).not.toBeInTheDocument();
  });

  it("keeps the search field on mobile and opens filters from the trailing icon", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();

    render(
      <ListSearchBar
        id="unit-list-search-mobile-filters"
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        label="搜尋商品"
        submitLabel="搜尋"
        filters={filters}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "搜尋商品" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "售價範圍" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "開啟篩選" }));
    expect(screen.getByRole("dialog", { name: "篩選" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "售價範圍" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確定" })).toBeInTheDocument();
  });

  it("applies mobile filters on confirm and closes the drawer", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    const onConfirmFilters = vi.fn();
    const onDismissFilters = vi.fn();

    render(
      <ListSearchBar
        id="unit-list-search-mobile-apply"
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        label="搜尋商品"
        submitLabel="搜尋"
        filters={filters}
        onConfirmFilters={onConfirmFilters}
        onDismissFilters={onDismissFilters}
      />,
    );

    await user.click(screen.getByRole("button", { name: "開啟篩選" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "售價範圍" }), "under-100");
    expect(onConfirmFilters).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "篩選" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(onConfirmFilters).toHaveBeenCalledTimes(1);
    expect(onDismissFilters).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores mobile filter drafts when the drawer is dismissed", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    const onConfirmFilters = vi.fn();
    const onDismissFilters = vi.fn();

    render(
      <ListSearchBar
        id="unit-list-search-mobile-dismiss"
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        label="搜尋商品"
        submitLabel="搜尋"
        filters={filters}
        onConfirmFilters={onConfirmFilters}
        onDismissFilters={onDismissFilters}
      />,
    );

    await user.click(screen.getByRole("button", { name: "開啟篩選" }));
    const dialog = screen.getByRole("dialog", { name: "篩選" });
    await user.click(within(dialog).getByRole("button", { name: "關閉篩選" }));
    expect(onDismissFilters).toHaveBeenCalledTimes(1);
    expect(onConfirmFilters).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(FILTERED_LIST_PAGES)(
    "owns the toolbar filters for %s",
    (relativePath) => {
      const source = readFileSync(
        path.resolve(process.cwd(), relativePath),
        "utf8",
      );

      expect(source).toContain("filters={");
      expect(source).toContain("filtersActive=");
      expect(source).toContain("onConfirmFilters");
      expect(source).toContain("onDismissFilters");
    },
  );
});
