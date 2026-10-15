import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";

it("shows localized empty copy with a decorative scalable default illustration", () => {
  const { container } = render(<EmptyState title="目前沒有訂單。" description="完成訂購後，訂單會顯示在這裡。" />);
  expect(screen.getByRole("status")).toHaveTextContent("目前沒有訂單。");
  expect(screen.getByText("完成訂購後，訂單會顯示在這裡。")).toBeInTheDocument();
  expect(container.querySelector("img")).toHaveAttribute("src", "/assets/empty-box.svg");
  expect(container.querySelector("img")).toHaveAttribute("alt", "");
});

it("supports a custom illustration and recovery action without requiring a description", () => {
  const { container } = render(<EmptyState title="No results" illustration={<span>Custom art</span>} action={<button>Reset filters</button>} />);
  expect(screen.getByText("Custom art")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset filters" })).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
});
