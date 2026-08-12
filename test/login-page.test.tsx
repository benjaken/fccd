import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/components/LoginPage";
import i18n from "@/i18n";

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    signIn: auth.signIn,
    resetPassword: auth.resetPassword,
    configured: true,
  }),
}));

describe("LoginPage", () => {
  beforeEach(async () => {
    auth.signIn.mockReset();
    auth.resetPassword.mockReset();
    await i18n.changeLanguage("zh-HK");
  });

  it("renders Traditional Chinese by default", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: "歡迎回來" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("電郵地址")).toBeInTheDocument();
    expect(screen.getByLabelText("密碼")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "登入" }),
    ).toBeInTheDocument();
  });

  it("validates credentials before calling Supabase", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "登入" }));

    expect(
      screen.getByText("請輸入有效電郵地址。"),
    ).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("switches the visible interface to English", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(
      screen.getByRole("button", { name: "切換語言" }),
    );

    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("opens and closes the password reset view", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(
      screen.getByRole("button", { name: "忘記密碼？" }),
    );
    expect(
      screen.getByRole("heading", { name: "重設密碼" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回登入" }));
    expect(
      screen.getByRole("heading", { name: "歡迎回來" }),
    ).toBeInTheDocument();
  });
});
