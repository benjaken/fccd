import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPortalOpsPage } from "@/components/settings/CustomerPortalOpsPage";
import { CustomerPortalRewardRulesPage } from "@/components/settings/CustomerPortalRewardRulesPage";
import { CustomerPortalApplicationsPage } from "@/components/settings/CustomerPortalApplicationsPage";
import "@/lib/customer-portal-i18n";

const mocks = vi.hoisted(() => ({
  orgs: vi.fn(), rules: vi.fn(), applications: vi.fn(), policy: vi.fn(),
  canEdit: true,
}));
vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => mocks.canEdit }),
}));
vi.mock("@/lib/customer-portal-ops", async (original) => ({
  ...await original<typeof import("@/lib/customer-portal-ops")>(),
  listPortalOpsOrgs: mocks.orgs,
  listPortalOpsChannels: vi.fn(async () => []),
}));
vi.mock("@/lib/customer-portal-reward-rules-ops", async (original) => ({
  ...await original<typeof import("@/lib/customer-portal-reward-rules-ops")>(),
  listRewardRules: mocks.rules,
  listPointHolidays: vi.fn(async()=>[]),
}));
vi.mock("@/lib/customer-portal-applications-ops", async (original) => ({
  ...await original<typeof import("@/lib/customer-portal-applications-ops")>(),
  listOrganizationApplications: mocks.applications,
  fetchOrganizationApplicationPage: async (page: number) => {
    const result = await mocks.applications(page);
    return Array.isArray(result) ? { rows: result, total: result.length, page: 1 } : result;
  },
  getBrExpiryPolicy: mocks.policy,
}));

const pages = [
  { Component: CustomerPortalOpsPage, load: mocks.orgs, columns: 6, skeletonRows: 15, empty: "尚未建立機構。", emptyInTable: false },
  { Component: CustomerPortalRewardRulesPage, load: mocks.rules, columns: 4, skeletonRows: 15, empty: "尚未有積分規則版本。", emptyInTable: true },
  { Component: CustomerPortalApplicationsPage, load: mocks.applications, columns: 5, skeletonRows: 15, empty: "目前沒有公司申請。", emptyInTable: false },
];

beforeEach(() => {
  mocks.canEdit = true;
  mocks.orgs.mockResolvedValue([]);
  mocks.rules.mockResolvedValue([]);
  mocks.applications.mockResolvedValue([]);
  mocks.policy.mockResolvedValue(null);
});

describe.each(pages)("$Component.name shared table", ({ Component, load, columns, skeletonRows, empty, emptyInTable }) => {
  it("keeps the header and loading skeleton in the table, then shows its empty state", async () => {
    load.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<MemoryRouter><Component /></MemoryRouter>);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(columns);
    expect(table.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    expect(within(table).getAllByRole("row")).toHaveLength(skeletonRows+1);
    unmount();
    load.mockResolvedValue([]);
    render(<MemoryRouter><Component /></MemoryRouter>);
    if (emptyInTable) {
      expect(await within(screen.getByRole("table")).findByText(empty)).toBeInTheDocument();
    } else {
      expect(await screen.findByText(empty)).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    }
  });

  it("keeps table headings after a load failure and retries without reporting an empty list", async () => {
    load.mockRejectedValueOnce(new Error("unavailable"));
    render(<MemoryRouter><Component /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("操作未完成，請重試。");
    if (emptyInTable) {
      expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(columns);
    }
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(await screen.findByText(empty)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

it("preserves organization navigation and edit permission", async () => {
  mocks.orgs.mockResolvedValue([{ id: "org", name: "測試機構", admin_count: 1, member_count: 2, menu_count: 3, is_active: true }]);
  const { unmount } = render(<MemoryRouter><CustomerPortalOpsPage /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "測試機構" })).toHaveAttribute("href", "/settings/customer-portal/org");
  expect(screen.getByRole("link", { name: "管理" })).toHaveAttribute("href", "/settings/customer-portal/org");
  fireEvent.click(screen.getByRole("button", { name: "編輯機構" }));
  expect(screen.getByLabelText("機構名稱")).toHaveValue("測試機構");
  unmount();
  mocks.canEdit = false;
  render(<MemoryRouter><CustomerPortalOpsPage /></MemoryRouter>);
  await screen.findByRole("link", { name: "測試機構" });
  expect(screen.getByRole("link", { name: "管理" })).toHaveAttribute("href", "/settings/customer-portal/org");
  expect(screen.queryByRole("button", { name: "編輯機構" })).not.toBeInTheDocument();
});

it("shows reward history and opens the existing version form", async () => {
  mocks.rules.mockResolvedValue([{ id: "rule", hkd_per_point: 25, effective_at: "2026-10-12T08:00:00Z", created_at: "2026-10-12T08:00:00Z", is_active: true }]);
  render(<MemoryRouter><CustomerPortalRewardRulesPage /></MemoryRouter>);
  await waitFor(() => expect(within(screen.getByRole("table")).getByText("25")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "新增規則版本" }));
  expect(screen.getByRole("spinbutton")).toHaveValue(25);
});

it("requests the next company-application page from the server and keeps the total visible", async () => {
  mocks.applications.mockImplementation(async (page: number) => ({
    rows: [{ id: `application-${page}`, company_name: `Company ${page}`, applicant_email: "applicant@example.com", status: "pending_review", br_expires_on: null }],
    total: 16, page,
  }));
  render(<MemoryRouter><CustomerPortalApplicationsPage /></MemoryRouter>);
  expect(await screen.findByText("Company 1")).toBeInTheDocument();
  expect(screen.getByText("顯示 1–15，共 16 筆")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
  expect(await screen.findByText("Company 2")).toBeInTheDocument();
  expect(mocks.applications).toHaveBeenCalledWith(2);
  expect(screen.queryByText("Company 1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "下一頁" })).toBeDisabled();
});
