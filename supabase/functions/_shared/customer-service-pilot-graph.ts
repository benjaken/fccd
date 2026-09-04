import { Annotation, END, START, StateGraph } from "npm:@langchain/langgraph@1.4.13";

import type {
  ClassifiedMessage,
  CustomerServiceIntent,
} from "./customer-service-intents.ts";

export type CustomerServicePilotGoal = "order_change" | "catering_inquiry";

export type CustomerServicePilotAction =
  | "cancel_current"
  | "continue_order_change"
  | "continue_catering"
  | "start_order_change"
  | "start_catering"
  | "resume_previous"
  | "route_other";

type PilotState = {
  activeGoal: CustomerServicePilotGoal | null;
  conversationState: string;
  intent: CustomerServiceIntent;
  dialogAction: NonNullable<ClassifiedMessage["dialogAction"]>;
  action: CustomerServicePilotAction;
};

const PilotAnnotation = Annotation.Root({
  activeGoal: Annotation(),
  conversationState: Annotation(),
  intent: Annotation(),
  dialogAction: Annotation(),
  action: Annotation(),
});

function goalForIntent(intent: CustomerServiceIntent): CustomerServicePilotGoal | null {
  if (intent === "handoff_order") return "order_change";
  if (intent === "collect_inquiry") return "catering_inquiry";
  return null;
}

function routePilot(state: PilotState): Partial<PilotState> {
  const current = state.activeGoal;
  const target = goalForIntent(state.intent);
  if (current && state.dialogAction === "cancel_current") {
    return { action: "cancel_current" };
  }
  if (state.dialogAction === "resume_previous") {
    return { action: "resume_previous" };
  }
  if (target === "order_change") {
    return {
      action: current === "order_change"
        ? "continue_order_change"
        : "start_order_change",
    };
  }
  if (target === "catering_inquiry") {
    return {
      action: current === "catering_inquiry"
        ? "continue_catering"
        : "start_catering",
    };
  }
  if (current && [
    "continue_current",
    "add_information",
    "select_option",
    "confirm",
    "deny",
    "correct_previous",
  ].includes(state.dialogAction)) {
    return {
      action: current === "order_change"
        ? "continue_order_change"
        : "continue_catering",
    };
  }
  return { action: "route_other" };
}

const pilotGraph = new StateGraph(PilotAnnotation)
  .addNode("route", routePilot)
  .addEdge(START, "route")
  .addEdge("route", END)
  .compile();

export function inferCustomerServicePilotGoal(input: {
  activeGoal?: CustomerServicePilotGoal | null;
  state: string;
  pendingRequest?: string | null;
  selectedOrderId?: string | null;
}) {
  if (input.activeGoal) return input.activeGoal;
  if (input.state === "collecting") return "catering_inquiry" as const;
  if (input.state === "picking_handoff_order") return "order_change" as const;
  if (
    input.state === "verifying_order" &&
    input.pendingRequest?.startsWith("handoff:")
  ) return "order_change" as const;
  if (input.state === "awaiting_human" && input.selectedOrderId) {
    return "order_change" as const;
  }
  return null;
}

export async function decideCustomerServicePilotAction(input: {
  activeGoal: CustomerServicePilotGoal | null;
  conversationState: string;
  classified: ClassifiedMessage;
}): Promise<CustomerServicePilotAction> {
  const result = await pilotGraph.invoke({
    activeGoal: input.activeGoal,
    conversationState: input.conversationState,
    intent: input.classified.intent,
    dialogAction: input.classified.dialogAction ?? "continue_current",
    action: "route_other",
  });
  return result.action;
}
