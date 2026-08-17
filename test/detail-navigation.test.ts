import { describe, expect, it } from "vitest";

import {
  backPathFromState,
  currentAppPath,
  detailFromLocation,
  isSafeAppPath,
} from "@/lib/detail-navigation";

describe("detail navigation", () => {
  it("records the current list path, including query filters", () => {
    expect(
      detailFromLocation({ pathname: "/delivery", search: "" }),
    ).toEqual({ from: "/delivery" });
    expect(
      detailFromLocation({
        pathname: "/orders",
        search: "?status=confirmed",
      }),
    ).toEqual({ from: "/orders?status=confirmed" });
    expect(currentAppPath({ pathname: "/quotes/high-chance" })).toBe(
      "/quotes/high-chance",
    );
  });

  it("returns to the recorded origin and ignores unsafe paths", () => {
    expect(backPathFromState({ from: "/delivery" }, "/orders")).toBe(
      "/delivery",
    );
    expect(backPathFromState(undefined, "/orders")).toBe("/orders");
    expect(backPathFromState({ from: "//evil.example" }, "/orders")).toBe(
      "/orders",
    );
    expect(backPathFromState({ from: "https://evil.example" }, "/quotes")).toBe(
      "/quotes",
    );
    expect(isSafeAppPath("/delivery")).toBe(true);
    expect(isSafeAppPath("//evil.example")).toBe(false);
  });
});
