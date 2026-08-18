import { describe, expect, it, vi } from "vitest";

import {
  isQzPrinterHealthy,
  qzStatusKey,
  qzStatusMeta,
  useQzTray,
} from "@/lib/qz-tray";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return children;
}

function fakeClient(overrides: {
  connect?: () => Promise<void>;
  listPrinters?: () => Promise<string[]>;
  queryStatuses?: () => Promise<Array<{
    name: string;
    status: string | null;
    severity: string | null;
    message: string | null;
  }>>;
}) {
  return {
    connect: overrides.connect ?? vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    listPrinters: overrides.listPrinters ?? vi.fn(async () => []),
    queryStatuses:
      overrides.queryStatuses ?? vi.fn(async () => []),
  };
}

describe("QZ printer status mapping", () => {
  it("maps every known status to a display key and tone", () => {
    expect(qzStatusKey("PAPER_OUT")).toBe("paperOut");
    expect(qzStatusKey("PAPEROUT")).toBe("paperOut");
    expect(qzStatusKey("OFFLINE")).toBe("offline");
    expect(qzStatusKey("NO_TONER")).toBe("noToner");
    expect(qzStatusKey("TONER_LOW")).toBe("tonerLow");
    expect(qzStatusKey("DOOR_OPEN")).toBe("doorOpen");
    expect(qzStatusKey("PAUSED")).toBe("paused");
    expect(qzStatusKey("USER_INTERVENTION")).toBe("userIntervention");
    expect(qzStatusKey("OUTPUT_BIN_FULL")).toBe("outputBinFull");
    expect(qzStatusKey("PAPER_PROBLEM")).toBe("paperProblem");
    expect(qzStatusKey("PAPER_JAM")).toBe("paperProblem");
    expect(qzStatusKey("NOT_AVAILABLE")).toBe("notAvailable");
    expect(qzStatusKey("PENDING_DELETION")).toBe("pendingDeletion");
    expect(qzStatusKey("SERVER_UNKNOWN")).toBe("serverUnknown");
    expect(qzStatusKey("ONLINE")).toBe("ready");
    expect(qzStatusKey("OK")).toBe("ready");
    expect(qzStatusKey(null)).toBe("unknown");
    expect(qzStatusKey("")).toBe("unknown");
    expect(qzStatusKey("WEIRD_STATE")).toBe("weird_state");
  });

  it("marks paper-out and offline printers as unhealthy", () => {
    expect(isQzPrinterHealthy("PAPER_OUT")).toBe(false);
    expect(isQzPrinterHealthy("OFFLINE")).toBe(false);
    expect(isQzPrinterHealthy("ONLINE")).toBe(true);
    expect(isQzPrinterHealthy(null)).toBe(false);
    expect(isQzPrinterHealthy("TONER_LOW")).toBe(false);
  });

  it("derives tones from the status groups", () => {
    expect(qzStatusMeta("PAPER_OUT").tone).toBe("red");
    expect(qzStatusMeta("OFFLINE").tone).toBe("red");
    expect(qzStatusMeta("TONER_LOW").tone).toBe("amber");
    expect(qzStatusMeta("ONLINE").tone).toBe("green");
    expect(qzStatusMeta(null).tone).toBe("amber");
  });
});

describe("useQzTray", () => {
  it("connects, lists printers, and reports their status", async () => {
    const client = fakeClient({
      connect: vi.fn(async () => {}),
      listPrinters: vi.fn(async () => ["Zebra ZD421"]),
      queryStatuses: vi.fn(async () => [
        { name: "Zebra ZD421", status: "PAPER_OUT", severity: "WARN", message: null },
      ]),
    });

    const { result } = renderHook(
      () => useQzTray({ client, connectTimeoutMs: 500 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(result.current.printers).toEqual(["Zebra ZD421"]);
    expect(result.current.statuses[0]).toMatchObject({ status: "PAPER_OUT" });
  });

  it("falls back to connected with unknown statuses when status query fails", async () => {
    const client = fakeClient({
      connect: vi.fn(async () => {}),
      listPrinters: vi.fn(async () => ["Printer A"]),
      queryStatuses: vi.fn(async () => {
        throw new Error("unsupported");
      }),
    });

    const { result } = renderHook(
      () => useQzTray({ client, connectTimeoutMs: 500 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(result.current.printers).toEqual(["Printer A"]);
    expect(result.current.statuses[0]).toMatchObject({ status: null });
  });

  it("marks the connection failed when QZ Tray is not running", async () => {
    const client = fakeClient({
      connect: vi.fn(async () => {
        throw new Error("QZ Tray not running");
      }),
    });

    const { result } = renderHook(
      () => useQzTray({ client, connectTimeoutMs: 500 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(result.current.error).toBe("QZ Tray not running");
    expect(result.current.printers).toEqual([]);
  });

  it("does not auto-connect when autoConnect is disabled", async () => {
    const connect = vi.fn(async () => {});
    const client = fakeClient({ connect });

    const { result } = renderHook(
      () => useQzTray({ client, autoConnect: false, connectTimeoutMs: 500 }),
      { wrapper },
    );

    expect(result.current.state).toBe("idle");
    expect(connect).not.toHaveBeenCalled();
  });
});
