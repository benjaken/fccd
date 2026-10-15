import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RewardCatalogList } from "@/components/customer-portal/RewardCatalogList";
import "@/lib/customer-portal-i18n";
vi.mock("@/lib/customer-reward-catalog", () => ({
  listRewardCatalog: async () => [{ id: "reward", name: "禮品", kind: "gift", points_cost: 10, stock: 1, image_object_path: "catalog/reward.png" }],
  rewardCatalogImageUrl: async () => "https://example.com/reward.png",
}));
it("renders the catalog image and replaces a broken image without a permanent loading skeleton", async () => {
  const {container} = render(<RewardCatalogList balance={20} onRedeem={vi.fn()} />);
  await screen.findByText("禮品", {selector:"strong"});
  await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/reward.png"));
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".lucide-gift")).not.toBeNull();
  expect(container.querySelector(".portal-row-image-bone")).toBeNull();
});
