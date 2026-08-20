import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FactoryQzTrayBanner,
  FactoryQzTrayStatus,
  PrinterStatusRow,
} from "@/components/FactoryQzTray";
import i18n from "@/i18n";
import type { useQzTray } from "@/lib/qz-tray";

type QzState = ReturnType<typeof useQzTray>;

function qzState(overrides: Partial<QzState> = {}): QzState {
  return {
    state: "idle",
    printers: [],
    statuses: [],
    error: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    printLabels: vi.fn(async () => {}),
    ...overrides,
  } as QzState;
}

function StatusHarness({ qz }: { qz: QzState }) {
  const [open, setOpen] = useState(false);
  return (
    <FactoryQzTrayStatus
      qz={qz}
      open={open}
      onToggle={() => setOpen((current) => !current)}
    />
  );
}

describe("FactoryQzTrayStatus", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows a connected chip with the printer count", () => {
    render(
      <StatusHarness
        qz={qzState({
          state: "connected",
          printers: ["Zebra ZD421", "Epson TM-T20"],
          statuses: [
            { name: "Zebra ZD421", status: "PAPER_OUT", severity: "WARN", message: null },
            { name: "Epson TM-T20", status: "ONLINE", severity: "OK", message: null },
          ],
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "QZ Tray 已連接 (2)" }),
    ).toBeInTheDocument();
  });

  it("expands to list every printer with its status", async () => {
    const user = userEvent.setup();
    render(
      <StatusHarness
        qz={qzState({
          state: "connected",
          printers: ["Zebra ZD421"],
          statuses: [
            { name: "Zebra ZD421", status: "PAPER_OUT", severity: "WARN", message: null },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "QZ Tray 已連接 (1)" }));
    expect(screen.getByText("Zebra ZD421")).toBeInTheDocument();
    expect(screen.getByText("缺紙")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新查詢打印機" })).toBeInTheDocument();
  });

  it("shows a retry action when QZ Tray is not running", async () => {
    const user = userEvent.setup();
    const connect = vi.fn(async () => {});
    render(
      <StatusHarness qz={qzState({ state: "failed", connect })} />,
    );

    await user.click(screen.getByRole("button", { name: "QZ Tray 未啟動" }));
    expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重試" }));
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe("FactoryQzTrayBanner", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows a compact connected tip with the printer count", () => {
    render(
      <FactoryQzTrayBanner
        qz={qzState({
          state: "connected",
          printers: ["Zebra ZD421"],
          statuses: [],
        })}
      />,
    );

    expect(screen.getByText("QZ Tray 已連接 (1)")).toBeInTheDocument();
    expect(
      screen.queryByText("QZ Tray 已連接，可以使用打印功能 (1 部打印機)。"),
    ).not.toBeInTheDocument();
  });

  it("shows a compact failed tip with a retry button", async () => {
    const user = userEvent.setup();
    const connect = vi.fn(async () => {});
    render(
      <FactoryQzTrayBanner
        qz={qzState({ state: "failed", connect })}
      />,
    );

    expect(screen.getByText("QZ Tray 未啟動")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("factory-qz-tip", "is-failed");
    await user.click(screen.getByRole("button", { name: "重試" }));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while idle", () => {
    const { container } = render(<FactoryQzTrayBanner qz={qzState({ state: "idle" })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PrinterStatusRow", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("labels a paper-out printer in Chinese", () => {
    render(
      <PrinterStatusRow
        printer={{ name: "Printer A", status: "PAPER_OUT", severity: "WARN", message: null }}
      />,
    );

    expect(screen.getByText("Printer A")).toBeInTheDocument();
    expect(screen.getByText("缺紙")).toBeInTheDocument();
  });

  it("labels an unknown status as unknown", () => {
    render(
      <PrinterStatusRow
        printer={{ name: "Printer B", status: null, severity: null, message: null }}
      />,
    );

    expect(screen.getByText("狀態未知")).toBeInTheDocument();
  });
});
