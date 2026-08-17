import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import i18n from "@/i18n";

const auth = vi.hoisted(() => ({
  session: null as null | { user: { email: string } },
  loading: false,
  profileLoading: false,
}));

vi.mock("@/auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    session: auth.session,
    loading: auth.loading,
    profileLoading: auth.profileLoading,
    signIn: vi.fn(),
    resetPassword: vi.fn(),
    configured: true,
  }),
}));

function renderPath(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("Standalone workspace pages", () => {
  beforeEach(async () => {
    auth.session = null;
    auth.loading = false;
    auth.profileLoading = false;
    await i18n.changeLanguage("zh-HK");
  });

  it("requires sign-in before showing the factory page", () => {
    renderPath("/factory");

    expect(
      screen.getByRole("heading", { name: "歡迎回來" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "工場版面" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspaces" }),
    ).not.toBeInTheDocument();
  });

  it("shows the factory page without the ops nav after sign-in", () => {
    auth.session = { user: { email: "ops@foodchannels.com" } };
    renderPath("/factory");

    expect(screen.getByRole("heading", { name: "工場版面" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "歡迎回來" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspaces" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });

  it("shows the driver page as a standalone screen without the ops nav", () => {
    renderPath("/driver-delivery");

    expect(screen.getByRole("heading", { name: "司機送貨" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "歡迎回來" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspaces" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });
});
