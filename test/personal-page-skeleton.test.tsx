import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CustomerGuidePage } from "@/components/customer-portal/CustomerGuidePage";
import { AccountOrderFeedback } from "@/components/customer-portal/OrderFeedbackPage";
import "@/lib/customer-personal-i18n";
const mocks = vi.hoisted(() => ({ guides: vi.fn(), feedback: vi.fn() }));
vi.mock("@/lib/customer-portal-guides", () => ({ fetchPublishedGuides: mocks.guides }));
vi.mock("@/lib/customer-order-feedback", () => ({ fetchAccountOrderFeedback: mocks.feedback, openOrderFeedback: vi.fn(), submitAccountOrderFeedback: vi.fn(), submitOrderFeedback: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("replaces the article skeleton with the requested published guide", async () => {
  let finish!: (rows: Array<{ slug: string; title: string; body: string }>) => void;
  mocks.guides.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { container } = render(<MemoryRouter initialEntries={["/guides/about"]}><Routes><Route path="/guides/:slug" element={<CustomerGuidePage />} /></Routes></MemoryRouter>);
  expect(container.querySelector('[data-skeleton="guide"]')).toHaveAttribute("aria-busy", "true");
  await act(async () => finish([{ slug: "about", title: "關於我們", body: "<p>公司介紹內容</p>" }]));
  expect(screen.getByRole("heading", { name: "關於我們" })).toBeInTheDocument();
  expect(screen.getByText("公司介紹內容")).toBeInTheDocument();
  expect(container.querySelector("[data-skeleton]")).not.toBeInTheDocument();
});

it("shows a feedback form skeleton only while feedback is pending", async () => {
  let finish!: (value: null) => void;
  mocks.feedback.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { container } = render(<AccountOrderFeedback orderId="order" />);
  expect(container.querySelector('[data-skeleton="feedback"]')).toHaveAttribute("aria-busy", "true");
  await act(async () => finish(null));
  expect(container.querySelector("[data-skeleton]")).not.toBeInTheDocument();
});

it("replaces a failed article load with the existing error state", async () => {
  mocks.guides.mockRejectedValue(new Error("offline"));
  const { container } = render(<MemoryRouter><CustomerGuidePage /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(container.querySelector("[data-skeleton]")).not.toBeInTheDocument();
});
