import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FactoryProductionCalendarPage } from "@/components/FactoryProductionCalendarPage";
import type { QzTrayClient } from "@/lib/qz-tray";

const qzClient: QzTrayClient = {
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  listPrinters: vi.fn(async () => []),
  queryStatuses: vi.fn(async () => []),
  printLabels: vi.fn(async () => {}),
};

describe("FactoryProductionCalendarPage", () => {
  it("returns from the production calendar to the factory board", async () => {
    const user = userEvent.setup();
    const close = vi.spyOn(window, "close").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/factory/production-calendar"]}>
        <Routes>
          <Route
            path="/factory/production-calendar"
            element={<FactoryProductionCalendarPage qzClient={qzClient} />}
          />
          <Route path="/factory" element={<h1>工場版面</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "返回工場版面" }));

    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "工場版面" })).toBeInTheDocument();
    close.mockRestore();
  });
});
