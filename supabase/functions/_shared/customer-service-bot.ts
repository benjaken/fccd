import {
  classifyCustomerServiceMessage,
  hasCollectableSlots,
  type ClassifiedMessage,
  type InquirySlots,
} from "./customer-service-intents.ts";
import {
  faqReply,
  lookupListReply,
  lookupSummaryReply,
  REPLIES,
  sanitizeOutboundReply,
} from "./customer-service-replies.ts";

export type CustomerServiceOrder = {
  order_id: string;
  order_number: string | null;
  order_date: string | null;
  delivery_at: string | null;
  delivery_status: string | null;
  masked_email: string | null;
  masked_address: string | null;
  addon_url: string | null;
};

export type CustomerServiceConversation = {
  phone_normalized: string;
  state: "identifying" | "picking_order" | "collecting" | "human_owned";
  selected_order_id: string | null;
  handoff_at: string | null;
};

export type CustomerServiceFaqHit = {
  id: string;
  question: string;
  answer: string;
};

export type CustomerServiceInquiryWrite = {
  quote_id: string;
  order_number: string | null;
  created: boolean;
};

export type CustomerServiceBotDeps = {
  lookupOrders: (phone: string) => Promise<CustomerServiceOrder[]>;
  writeInquiry: (
    phone: string,
    slots: InquirySlots,
    anotherEvent: boolean,
  ) => Promise<CustomerServiceInquiryWrite>;
  searchFaqs: (query: string) => Promise<CustomerServiceFaqHit[]>;
  notifyInternal: (input: {
    phone: string;
    quoteId: string;
    orderNumber: string | null;
    summary: string;
  }) => Promise<void>;
};

export type BotTurn = {
  reply: string | null;
  conversation: CustomerServiceConversation;
  wroteInquiry: boolean;
  notified: boolean;
  usedModel: boolean;
};

function nextConversation(
  current: CustomerServiceConversation,
  patch: Partial<CustomerServiceConversation>,
): CustomerServiceConversation {
  return { ...current, ...patch };
}

async function replyLookup(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  const orders = await deps.lookupOrders(phone);
  if (classified.orderNumber) {
    const selected = orders.find(
      (order) => (order.order_number || "").toUpperCase() === classified.orderNumber,
    );
    if (selected) {
      return {
        reply: lookupSummaryReply(selected),
        conversation: nextConversation(conversation, {
          state: "identifying",
          selected_order_id: selected.order_id,
        }),
        wroteInquiry: false,
        notified: false,
        usedModel: classified.usedModel,
      };
    }
  }
  if (orders.length === 1) {
    return {
      reply: lookupSummaryReply(orders[0]),
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: orders[0].order_id,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  if (orders.length > 1) {
    return {
      reply: lookupListReply(orders),
      conversation: nextConversation(conversation, {
        state: "picking_order",
        selected_order_id: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  return {
    reply: REPLIES.collectPrompt,
    conversation: nextConversation(conversation, { state: "collecting" }),
    wroteInquiry: false,
    notified: false,
    usedModel: classified.usedModel,
  };
}

async function replyCollect(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  if (!hasCollectableSlots(classified.slots)) {
    return {
      reply: conversation.state === "collecting" ? REPLIES.collectMore : REPLIES.collectPrompt,
      conversation: nextConversation(conversation, { state: "collecting" }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  const written = await deps.writeInquiry(phone, classified.slots, classified.slots.anotherEvent);
  const summary = [
    classified.slots.eventDate && `日期 ${classified.slots.eventDate}`,
    classified.slots.headcount && `人數 ${classified.slots.headcount}`,
    classified.slots.budget,
    classified.slots.dietary,
    classified.slots.cuisine,
  ]
    .filter(Boolean)
    .join("，");
  await deps.notifyInternal({
    phone,
    quoteId: written.quote_id,
    orderNumber: written.order_number,
    summary,
  });
  return {
    reply: REPLIES.collectDone,
    conversation: nextConversation(conversation, { state: "identifying" }),
    wroteInquiry: true,
    notified: true,
    usedModel: classified.usedModel,
  };
}

async function replyFaq(
  deps: CustomerServiceBotDeps,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
  query: string,
): Promise<BotTurn> {
  const hits = await deps.searchFaqs(query);
  if (hits[0]?.answer) {
    return {
      reply: faqReply(hits[0].answer),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  return {
    reply: REPLIES.noFaq,
    conversation: nextConversation(conversation, {
      state: "human_owned",
      handoff_at: new Date().toISOString(),
    }),
    wroteInquiry: false,
    notified: false,
    usedModel: classified.usedModel,
  };
}

export async function handleCustomerServiceTurn({
  phone,
  text,
  conversation,
  deps,
  classify = classifyCustomerServiceMessage,
}: {
  phone: string;
  text: string;
  conversation: CustomerServiceConversation;
  deps: CustomerServiceBotDeps;
  classify?: (text: string) => ClassifiedMessage;
}): Promise<BotTurn> {
  if (conversation.state === "human_owned") {
    return {
      reply: null,
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }

  const classified = classify(text);
  if (conversation.state === "picking_order" && classified.orderNumber) {
    return replyLookup(deps, phone, classified, conversation);
  }
  if (classified.intent === "prompt_injection" || classified.intent === "out_of_scope") {
    return {
      reply: sanitizeOutboundReply(REPLIES.refuse),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  if (classified.intent === "handoff") {
    return {
      reply: REPLIES.handoff,
      conversation: nextConversation(conversation, {
        state: "human_owned",
        handoff_at: new Date().toISOString(),
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  if (classified.intent === "lookup_order") {
    return replyLookup(deps, phone, classified, conversation);
  }
  if (classified.intent === "collect_inquiry" || conversation.state === "collecting") {
    return replyCollect(deps, phone, classified, conversation);
  }
  return replyFaq(deps, classified, conversation, text);
}
