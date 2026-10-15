import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountOrderFeedback } from "@/components/customer-portal/OrderFeedbackPage";
import type { OrderFeedback } from "@/lib/customer-order-feedback";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/customer-order-feedback", () => ({ fetchAccountOrderFeedback: mocks.fetch, submitAccountOrderFeedback: mocks.submit }));
const view: OrderFeedback = { order_number: "B-1550", delivery_at: null, submitted: false, comment: null };
beforeEach(() => vi.resetAllMocks());
describe("account order feedback", () => {
  it("shows a decorative feedback illustration only for the empty state", async () => {
    mocks.fetch.mockResolvedValue(null);
    const { container } = render(<AccountOrderFeedback orderId="one" showEmptyState />);
    await screen.findByRole("heading", { name: "暫未能填寫訂單意見" });
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "/assets/customer-personal/feedback-empty.png");
    expect(image).toHaveAttribute("alt", "");
  });
  it("preserves the feedback form and submitted comment", async () => {
    mocks.fetch.mockResolvedValue(view);
    mocks.submit.mockResolvedValue({ ...view, submitted: true, comment: "Good service" });
    render(<AccountOrderFeedback orderId="one" showEmptyState />);
    fireEvent.change(await screen.findByLabelText("你的意見"), { target: { value: "Good service" } });
    fireEvent.click(screen.getByRole("button", { name: "提交意見" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(await screen.findByText("Good service")).toBeInTheDocument();
    expect(mocks.submit).toHaveBeenCalledWith("one", "Good service");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("ignores a late response after changing orders", async () => {
    let resolveFirst!: (value: OrderFeedback) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce(null);
    const { rerender } = render(<AccountOrderFeedback orderId="one" showEmptyState />);
    expect(screen.getByRole("status")).toHaveTextContent("正在載入訂單意見");
    rerender(<AccountOrderFeedback orderId="two" showEmptyState />);
    await screen.findByRole("heading", { name: "暫未能填寫訂單意見" });
    await act(async () => resolveFirst(view));
    expect(screen.queryByText("B-1550")).not.toBeInTheDocument();
  });
  it("keeps unavailable feedback hidden in organization order details", async () => {
    mocks.fetch.mockResolvedValue(null);
    const { container } = render(<AccountOrderFeedback orderId="one" />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});
