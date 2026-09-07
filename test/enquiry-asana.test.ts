import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildConfirmedEnquiryOrderAsanaTask } from "../supabase/functions/_shared/enquiry-asana-task.ts";

describe("confirmed Enquiry order Asana sync", () => {
  it("builds an Asana task from confirmed order data", () => {
    const task = buildConfirmedEnquiryOrderAsanaTask({
      orderId: "order-1",
      orderNumber: "FCC-1001",
      customerName: "Ada Chan",
      companyName: "Example Ltd",
      phone: "91234567",
      email: "ada@example.com",
      address: "Central, Hong Kong",
      deliveryAt: "2026-09-12T16:00:00.000Z",
      deliveryTime: "12:30",
      amount: 1280,
      currency: "HKD",
      enquiryReference: "ENQ20260905001",
      description: "Corporate lunch",
      appUrl: "https://fccd.example.com/",
    });

    expect(task.name).toBe("Confirmed order | FCC-1001 | Ada Chan | Example Ltd");
    expect(task.due_on).toBe("2026-09-13");
    expect(task.notes).toContain("Enquiry: ENQ20260905001");
    expect(task.notes).toContain("Total: HKD 1280");
    expect(task.notes).toContain("FCCD order: https://fccd.example.com/orders/order-1");
  });

  it("keeps credentials server-side, authorizes the caller and claims before create", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/create-enquiry-asana-task/index.ts"),
      "utf8",
    );
    expect(source).toContain('requiredEnv("ASANA_ACCESS_TOKEN")');
    expect(source).toContain('fetch("https://app.asana.com/api/1.0/tasks"');
    expect(source).toContain("callerCanManageQuotes(request, admin)");
    expect(source).toContain('.eq("page_key", "quotes")');
    expect(source).toContain('.in("asana_status", ["not_created", "failed"])');
    expect(source).toContain("submission.asana_link || order.asana_link || sourceQuote.asana_link");
    expect(source).toContain('asana_status: "creating"');
    expect(source).toContain('asana_status: "created"');
    expect(source).toContain('asana_status: "failed"');
    expect(source).toContain('admin.from("orders").update({ asana_link: permalinkUrl })');
  });

  it("triggers Asana only after quote conversion and does not roll back the order", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/quotes.ts"), "utf8");
    const conversion = source.indexOf('supabase.rpc("convert_quote_to_order"');
    const asana = source.indexOf('supabase.functions.invoke("create-enquiry-asana-task"');
    expect(conversion).toBeGreaterThan(-1);
    expect(asana).toBeGreaterThan(conversion);
    expect(source).toContain("Asana failure is recorded by the");
  });
});
