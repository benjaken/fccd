import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordPage } from "@/components/ResetPasswordPage";
import i18n from "@/i18n";

const auth = vi.hoisted(() => ({
  updateRecoveredPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    session: { user: { id: "user-1", email: "employee@example.com" } },
    loading: false,
    configured: true,
    updateRecoveredPassword: auth.updateRecoveredPassword,
    signOut: auth.signOut,
  }),
}));

describe("ResetPasswordPage", () => {
  beforeEach(async () => {
    auth.updateRecoveredPassword.mockReset();
    auth.signOut.mockReset();
    await i18n.changeLanguage("zh-HK");
  });

  it("sets a recovery or invitation password and returns to sign in", async () => {
    const user = userEvent.setup();
    auth.updateRecoveredPassword.mockResolvedValue(null);
    auth.signOut.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("新密碼"), "Employee123");
    await user.type(screen.getByLabelText("確認新密碼"), "Employee123");
    await user.click(screen.getByRole("button", { name: "設定密碼" }));

    expect(auth.updateRecoveredPassword).toHaveBeenCalledWith("Employee123");
    expect(await screen.findByText(/密碼已設定完成/)).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("rejects mismatched passwords locally", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("新密碼"), "Employee123");
    await user.type(screen.getByLabelText("確認新密碼"), "Employee456");
    await user.click(screen.getByRole("button", { name: "設定密碼" }));

    expect(screen.getByText("兩次輸入的密碼不一致。")).toBeInTheDocument();
    expect(auth.updateRecoveredPassword).not.toHaveBeenCalled();
  });
});
