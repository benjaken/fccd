import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompanyEmployeesPage } from "@/components/settings/CompanyEmployeesPage";
import type { CompanyEmployee } from "@/lib/company-employees";

const employee: CompanyEmployee = {
  id: "employee-1",
  sourceStaffId: 5501,
  displayName: "Elena Leung",
  chineseName: "梁晞蕾",
  workEmail: "chifung.plan@gmail.com",
  privateEmail: null,
  companyPhone: "21234567",
  privatePhone: null,
  company: "FC",
  teamName: "Operations",
  position: "Team Member",
  isActive: true,
  linkedUserId: "user-1",
  lastSyncedAt: "2026-08-25T02:30:00Z",
};

describe("company employee directory", () => {
  it("renders an OTC2 employee and its linked FCCD account state", async () => {
    const loadEmployees = vi.fn().mockResolvedValue({
      total: 1,
      items: [employee],
    });

    render(
      <MemoryRouter>
        <CompanyEmployeesPage loadEmployees={loadEmployees} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Elena Leung")).toBeInTheDocument();
    expect(screen.getByText("chifung.plan@gmail.com")).toBeInTheDocument();
    expect(screen.getByText(/Linked|已連結/)).toBeInTheDocument();
    await waitFor(() =>
      expect(loadEmployees).toHaveBeenCalledWith({
        page: 1,
        search: "",
        status: "active",
      }),
    );
  });

  it("keeps identity, authorization, and local-account safeguards in the migration", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260825090000_otc2_company_employees.sql",
      ),
      "utf8",
    );
    const sync = readFileSync(
      resolve(process.cwd(), "supabase/functions/otc2-staff-sync/index.ts"),
      "utf8",
    );

    expect(migration).toContain("unique (source_system, source_staff_id)");
    expect(migration).toContain("'Company User'");
    expect(migration).toContain("'settings.employees'");
    expect(sync).toContain('profile.login_disabled_reason === "otc2_inactive"');
    expect(sync).toContain("} else if (!hasActiveSource && hasInactiveSource) {");
    expect(sync).toContain("self-heals an accidentally removed ban");
    expect(sync).not.toContain(
      "!hasActiveSource && hasInactiveSource && profile.login_enabled",
    );
    expect(sync).toContain("localAccountsUntouched");
  });

  it("offers an invitation for an active employee without an FCCD account", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const inviteEmployee = vi.fn().mockResolvedValue({
      user: { id: "new-user", email: employee.workEmail },
    });
    render(
      <MemoryRouter>
        <CompanyEmployeesPage
          loadEmployees={vi.fn().mockResolvedValue({
            total: 1,
            items: [{ ...employee, linkedUserId: null }],
          })}
          inviteEmployee={inviteEmployee}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /Invite account|開通帳號/ }));
    await waitFor(() => expect(inviteEmployee).toHaveBeenCalledWith(employee.id));
  });
});
