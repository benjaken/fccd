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
  loginEnabled: true,
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
    expect(sync).toContain("profile.login_enabled || !profile.login_disabled_reason");
    expect(sync).toContain("Preserve an explicit manual disable");
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

  it("allows an active employee's linked login account to be disabled", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const updateEmployeeLogin = vi.fn().mockResolvedValue({
      user: { id: "user-1", loginEnabled: false },
    });

    render(
      <MemoryRouter>
        <CompanyEmployeesPage
          loadEmployees={vi.fn().mockResolvedValue({ total: 1, items: [employee] })}
          updateEmployeeLogin={updateEmployeeLogin}
        />
      </MemoryRouter>,
    );

    const loginSwitch = await screen.findByRole("switch", {
      name: /Elena Leung/,
    });
    expect(loginSwitch).toBeChecked();
    await user.click(loginSwitch);

    await waitFor(() =>
      expect(updateEmployeeLogin).toHaveBeenCalledWith(employee.id, false),
    );
    await waitFor(() => expect(loginSwitch).not.toBeChecked());
  });

  it("defines a protected employee login-status lookup and manual Auth control", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260831130000_company_employee_login_controls.sql",
      ),
      "utf8",
    );
    const adminUsers = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-users/index.ts"),
      "utf8",
    );

    expect(migration).toContain("company_employee_login_status");
    expect(migration).toContain("private.has_page_access('settings.employees')");
    expect(adminUsers).toContain('action: "setEmployeeLogin"');
    expect(adminUsers).toContain('login_disabled_reason: payload.loginEnabled ? null : "manual_disabled"');
    expect(adminUsers).toContain('ban_duration: payload.loginEnabled ? "none" : "876000h"');
  });
});
