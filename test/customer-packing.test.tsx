import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPortalPackingPage } from "@/components/settings/CustomerPortalPackingPage";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/customer-portal-ops", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/customer-portal-ops")>(),
  fetchPortalOpsPackingList: mocks.list,
}));

function renderPage() {
  return render(<MemoryRouter><CustomerPortalPackingPage /></MemoryRouter>);
}

describe("customer portal packing list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ days: [{
      service_date: "2099-01-01", organization_id: "org", organization_name: "Acme Ltd",
      address_id: "a1", address_label: "Office", total_quantity: 3,
      lines: [{ member_email: "member@example.com", department: "Kitchen", items: [{ name: "雞扒餐", quantity: 3 }] }],
    }] });
  });
  it("summarises sent batches by delivery point with member details", async () => {
    renderPage();
    expect(await screen.findByText(/member@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Office/)).toBeInTheDocument();
    expect(screen.getByText(/Kitchen/)).toBeInTheDocument();
    expect(screen.getByText(/雞扒餐 × 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "列印分裝清單" })).toBeEnabled();
  });
  it("shows an empty state when there are no sent batches", async () => {
    mocks.list.mockResolvedValue({ days: [] });
    renderPage();
    expect(await screen.findByText("此期間沒有已送出的公司訂單。")).toBeInTheDocument();
  });
});
