import { describe, expect, it } from "vitest";

import {
  decideCustomerServicePilotAction,
  inferCustomerServicePilotGoal,
} from "../supabase/functions/_shared/customer-service-pilot-graph.ts";
import { emptyInquirySlots } from "../supabase/functions/_shared/customer-service-intents.ts";

function classified(
  intent: "handoff_order" | "collect_inquiry" | "search_faq",
  dialogAction: "continue_current" | "cancel_current" | "switch_task" | "new_request",
) {
  return {
    intent,
    dialogAction,
    slots: emptyInquirySlots(),
    orderNumber: "",
    usedModel: true,
  };
}

describe("customer-service LangGraph pilot", () => {
  it("withdraws the active order-change workflow from conversation context", async () => {
    await expect(decideCustomerServicePilotAction({
      activeGoal: "order_change",
      conversationState: "awaiting_human",
      classified: classified("search_faq", "cancel_current"),
    })).resolves.toBe("cancel_current");
  });

  it("switches from catering to an order change", async () => {
    await expect(decideCustomerServicePilotAction({
      activeGoal: "catering_inquiry",
      conversationState: "collecting",
      classified: classified("handoff_order", "switch_task"),
    })).resolves.toBe("start_order_change");
  });

  it("does not mistake a new cancel-order request for dialog cancellation", async () => {
    await expect(decideCustomerServicePilotAction({
      activeGoal: null,
      conversationState: "identifying",
      classified: classified("handoff_order", "new_request"),
    })).resolves.toBe("start_order_change");
  });

  it("restores pilot goals from persisted legacy states", () => {
    expect(inferCustomerServicePilotGoal({ state: "collecting" })).toBe("catering_inquiry");
    expect(inferCustomerServicePilotGoal({
      state: "verifying_order",
      pendingRequest: "handoff:改送貨日期",
    })).toBe("order_change");
  });

  it("recognizes explicit requests to resume a suspended task", async () => {
    await expect(decideCustomerServicePilotAction({
      activeGoal: null,
      conversationState: "identifying",
      classified: classified("search_faq", "resume_previous"),
    })).resolves.toBe("resume_previous");
  });
});
