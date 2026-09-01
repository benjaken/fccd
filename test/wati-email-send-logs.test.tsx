import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WatiEmailSendLogsPage } from "../src/components/settings/WatiEmailSendLogsPage";

describe("WATI and email send logs", () => {
  it("exposes only successful automatic sends through a permission-scoped RPC", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260901110000_wati_email_send_logs.sql"),
      "utf8",
    );

    expect(migration).toContain("settings.wati_email_logs");
    expect(migration).toContain("private.has_page_access('settings.wati_email_logs')");
    expect(migration).toContain("outbox.wati_sent_at");
    expect(migration).toContain("outbox.email_sent_at");
    expect(migration).toContain("outbox.status = 'sent'");
    expect(migration).toContain("outbox.event_key not in");
    expect(migration).toContain("'bad_weather_notice'");
  });

  it("shows recipient and address while exposing full truncated content on hover", async () => {
    const loadLogs = vi.fn(async () => ({
      total: 1,
      items: [{
        id: "log-1",
        sentAt: "2026-09-01T02:30:00Z",
        channel: "wati" as const,
        eventKey: "delivery_today_reminder",
        templateName: "fcc2_delivery_reminder_v1",
        recipientName: "Chan Tai Man",
        recipientAddress: "+85291234567",
        orderNumber: "R/202609/001",
        detail: { parameters: [{ name: "date", value: "01/09/2026" }] },
      }],
    }));

    render(<WatiEmailSendLogsPage loadLogs={loadLogs} />);

    await waitFor(() => expect(loadLogs).toHaveBeenCalled());
    expect(screen.getByText("Chan Tai Man")).toBeInTheDocument();
    expect(screen.getByText("+85291234567")).toBeInTheDocument();
    expect(screen.getByText("R/202609/001")).toBeInTheDocument();
    const content = await screen.findByTitle(
      /fcc2_delivery_reminder_v1 · date: 01\/09\/2026/,
    );
    expect(content).toHaveClass("wati-email-log-content-summary");
    expect(content).toHaveAttribute("tabindex", "0");
  });
});
