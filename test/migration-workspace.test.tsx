import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import i18n from "@/i18n";

const auth = vi.hoisted(() => ({
  session: null as null | {
    user: { app_metadata: { role?: string } };
  },
}));

vi.mock("@/auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    session: auth.session,
  }),
}));

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderWorkspace(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <CurrentLocation />
    </MemoryRouter>,
  );
}

describe("Migration workspace", () => {
  beforeEach(async () => {
    auth.session = null;
    await i18n.changeLanguage("en");
  });

  it("redirects /migration to control and navigates between routed tabs", async () => {
    const user = userEvent.setup();
    renderWorkspace("/migration");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/migration/control",
      ),
    );

    await user.click(screen.getByRole("link", { name: "FK Mapping" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/migration/fk");

    await user.click(screen.getByRole("link", { name: "Migration Control" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/migration/control",
    );
  });

  it("locks every write action without a Super Admin app_metadata role", () => {
    renderWorkspace("/migration/control");

    for (const name of [
      "Full Migration",
      "Incremental Sync",
      "Resume",
      "Switch to Supabase",
    ]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(
      screen.getAllByText(/current session requires the Super Admin/),
    ).toHaveLength(4);
  });

  it("shows the fixed historical cutoff", () => {
    renderWorkspace("/migration/control");

    expect(screen.getByText("2021-08-12 00:00:00 +08:00")).toBeInTheDocument();
    expect(
      screen.getByText("UTC: 2021-08-11T16:00:00.000Z"),
    ).toBeInTheDocument();
  });

  it("keeps source switching disabled when reconciliation gates are incomplete", () => {
    auth.session = {
      user: { app_metadata: { role: "Super Admin" } },
    };
    renderWorkspace("/migration/control");

    expect(
      screen.getByRole("button", { name: "Switch to Supabase" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Disabled: readiness and final reconciliation gates are incomplete.",
      ),
    ).toBeInTheDocument();
  });

  it("shows all entity mappings and real migration totals", () => {
    renderWorkspace("/migration/control");

    expect(
      screen.getByRole("heading", {
        name: "Bubble entity → Supabase target",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Table migration rate").closest("article")!)
        .getByText("100%"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Record migration rate").closest("article")!)
        .getByText("100%"),
    ).toBeInTheDocument();
    expect(screen.getByText("377,116 / 377,116")).toBeInTheDocument();
    expect(screen.getByText("order_bom_requirements")).toBeInTheDocument();
    expect(screen.getAllByText("Complete with issues")).toHaveLength(3);
    expect(screen.getByText("auth.users + user_profiles")).toBeInTheDocument();
    expect(screen.getByText("Adopt existing 24 profiles")).toBeInTheDocument();
  });

  it("shows database-verified FK aggregates separately from inferred mappings", () => {
    renderWorkspace("/migration/fk");

    expect(
      screen.getByRole("heading", { name: "Migrated UUID FK status" }),
    ).toBeInTheDocument();
    expect(screen.getByText("950,149")).toBeInTheDocument();
    expect(
      within(screen.getByText("Current open issue").closest("article")!)
        .getByText("19"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByText("Known future orphan references").closest("article")!,
      ).getByText("0"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Database verified")).toHaveLength(18);
    expect(screen.getByText("Inferred / sample verified")).toBeInTheDocument();
  });
});
