import {
  classifyCustomerServiceMessage,
  hasCollectableSlots,
  isCustomerServiceGreeting,
  normalizeCustomerServiceOrderNumber,
  type ClassifiedMessage,
  type InquirySlots,
} from "./customer-service-intents.ts";
import {
  faqReply,
  handoffNoOpenOrderReply,
  handoffOrderListReply,
  handoffOrderSelectedReply,
  lookupListReply,
  lookupNotFoundReply,
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
  state: "identifying" | "picking_order" | "picking_handoff_order" | "collecting" | "human_owned";
  selected_order_id: string | null;
  handoff_at: string | null;
  pending_request: string | null;
};

export type CustomerServiceFaqHit = {
  id: string;
  category?: string;
  question: string;
  answer: string;
};

export type CustomerServiceInquiryWrite = {
  quote_id: string;
  order_number: string | null;
  created: boolean;
};

export type CustomerServiceBotDeps = {
  replyTemplates?: Partial<Record<
    "help" | "handoff" | "collect_prompt" | "collect_more" | "collect_done" | "no_faq" | "refuse",
    string
  >>;
  lookupOrders: (phone: string) => Promise<CustomerServiceOrder[]>;
  writeInquiry: (
    phone: string,
    slots: InquirySlots,
    anotherEvent: boolean,
  ) => Promise<CustomerServiceInquiryWrite>;
  searchFaqs: (query: string) => Promise<CustomerServiceFaqHit[]>;
  answerFaqWithModel?: (
    query: string,
    candidates: CustomerServiceFaqHit[],
  ) => Promise<string | { answer: string; sourceIds: string[]; model: string } | null>;
  notifyInternal: (input: {
    phone: string;
    quoteId: string | null;
    orderNumber: string | null;
    summary: string;
    kind?: "inquiry" | "order_handoff";
  }) => Promise<void>;
};

export type BotTurn = {
  reply: string | null;
  conversation: CustomerServiceConversation;
  wroteInquiry: boolean;
  notified: boolean;
  usedModel: boolean;
  intentKey?: string;
  confidence?: number;
  toolKeys?: string[];
  failureReason?: string | null;
  faqSourceIds?: string[];
  model?: string | null;
};

function configuredReply(
  deps: CustomerServiceBotDeps,
  key: keyof NonNullable<CustomerServiceBotDeps["replyTemplates"]>,
  fallback: string,
) {
  return sanitizeOutboundReply(deps.replyTemplates?.[key]?.trim() || fallback);
}

function nextConversation(
  current: CustomerServiceConversation,
  patch: Partial<CustomerServiceConversation>,
): CustomerServiceConversation {
  return { ...current, ...patch };
}

function isUndeliveredOrder(order: CustomerServiceOrder) {
  const status = order.delivery_status?.trim() ?? "";
  return !/已送達|己送達|已經送達|delivered|已取消|己取消|取消|cancelled/i.test(status);
}

async function finishOrderHandoff(
  deps: CustomerServiceBotDeps,
  phone: string,
  order: CustomerServiceOrder,
  request: string,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  await deps.notifyInternal({
    phone,
    quoteId: order.order_id,
    orderNumber: order.order_number,
    summary: `客戶要求人工處理：${request || "更改訂單"}`,
    kind: "order_handoff",
  });
  return {
    reply: handoffOrderSelectedReply(order.order_number || "（未有單號）"),
    conversation: nextConversation(conversation, {
      state: "human_owned",
      selected_order_id: order.order_id,
      handoff_at: new Date().toISOString(),
      pending_request: null,
    }),
    wroteInquiry: false,
    notified: true,
    usedModel: false,
  };
}

async function replyOrderHandoff(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
  request: string,
): Promise<BotTurn> {
  const orders = (await deps.lookupOrders(phone)).filter(isUndeliveredOrder);
  const pendingRequest = conversation.pending_request?.trim() || request.trim();
  if (classified.orderNumber) {
    const requested = normalizeCustomerServiceOrderNumber(classified.orderNumber);
    const selected = orders.find(
      (order) => normalizeCustomerServiceOrderNumber(order.order_number) === requested,
    );
    if (selected) return finishOrderHandoff(deps, phone, selected, pendingRequest, conversation);
  }
  if (orders.length) {
    return {
      reply: handoffOrderListReply(pendingRequest, orders),
      conversation: nextConversation(conversation, {
        state: "picking_handoff_order",
        selected_order_id: null,
        pending_request: pendingRequest,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }
  await deps.notifyInternal({
    phone,
    quoteId: null,
    orderNumber: null,
    summary: `客戶要求人工處理，但未找到未送貨訂單：${pendingRequest || "更改訂單"}`,
    kind: "order_handoff",
  });
  return {
    reply: handoffNoOpenOrderReply(),
    conversation: nextConversation(conversation, {
      state: "human_owned",
      selected_order_id: null,
      handoff_at: new Date().toISOString(),
      pending_request: null,
    }),
    wroteInquiry: false,
    notified: true,
    usedModel: false,
  };
}

async function replyLookup(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  const orders = await deps.lookupOrders(phone);
  if (classified.orderNumber) {
    const requestedOrderNumber = normalizeCustomerServiceOrderNumber(classified.orderNumber);
    const selected = orders.find(
      (order) => normalizeCustomerServiceOrderNumber(order.order_number) === requestedOrderNumber,
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
    return {
      reply: lookupNotFoundReply(classified.orderNumber),
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
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
    reply: configuredReply(deps, "collect_prompt", REPLIES.collectPrompt),
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
      reply: conversation.state === "collecting"
        ? configuredReply(deps, "collect_more", REPLIES.collectMore)
        : configuredReply(deps, "collect_prompt", REPLIES.collectPrompt),
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
    reply: configuredReply(deps, "collect_done", REPLIES.collectDone),
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
  if (deps.answerFaqWithModel) {
    try {
      const modelAnswer = await deps.answerFaqWithModel(query, hits);
      const answer = typeof modelAnswer === "string" ? modelAnswer : modelAnswer?.answer;
      if (answer) {
        return {
          reply: faqReply(answer),
          conversation,
          wroteInquiry: false,
          notified: false,
          usedModel: true,
          faqSourceIds: typeof modelAnswer === "string" ? [] : modelAnswer?.sourceIds ?? [],
          model: typeof modelAnswer === "string" ? null : modelAnswer?.model ?? null,
        };
      }
    } catch (error) {
      console.error(
        "customer-service AI answer failed",
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
    }
  }
  if (hits[0]?.answer) {
    return {
      reply: faqReply(hits[0].answer),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
      faqSourceIds: [hits[0].id],
    };
  }
  return {
    reply: configuredReply(deps, "no_faq", REPLIES.noFaq),
    conversation,
    wroteInquiry: false,
    notified: false,
    usedModel: classified.usedModel,
    failureReason: "faq_not_found",
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
  classify?: (text: string) => ClassifiedMessage | Promise<ClassifiedMessage>;
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

  if (isCustomerServiceGreeting(text)) {
    return {
      reply: configuredReply(deps, "help", REPLIES.help),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }

  const classified = await classify(text);
  const annotate = (turn: BotTurn): BotTurn => ({
    ...turn,
    intentKey: classified.configuredIntentKey || classified.intent,
    confidence: classified.confidence,
    toolKeys: classified.toolKey ? [classified.toolKey] : [],
    failureReason: turn.failureReason ?? null,
  });
  if (conversation.state === "picking_handoff_order") {
    return annotate(await replyOrderHandoff(deps, phone, classified, conversation, text));
  }
  if (conversation.state === "picking_order" && classified.orderNumber) {
    return annotate(await replyLookup(deps, phone, classified, conversation));
  }
  if (classified.intent === "prompt_injection" || classified.intent === "out_of_scope") {
    return annotate({
      reply: configuredReply(deps, "refuse", REPLIES.refuse),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    });
  }
  if (classified.intent === "handoff") {
    await deps.notifyInternal({
      phone,
      quoteId: null,
      orderNumber: null,
      summary: `客戶要求人工協助：${text.trim().slice(0, 500)}`,
      kind: "order_handoff",
    });
    return annotate({
      reply: configuredReply(deps, "handoff", REPLIES.handoff),
      conversation: nextConversation(conversation, {
        state: "human_owned",
        handoff_at: new Date().toISOString(),
      }),
      wroteInquiry: false,
      notified: true,
      usedModel: classified.usedModel,
    });
  }
  if (classified.intent === "handoff_order") {
    return annotate(await replyOrderHandoff(deps, phone, classified, conversation, text));
  }
  if (classified.intent === "lookup_order") {
    return annotate(await replyLookup(deps, phone, classified, conversation));
  }
  if (classified.intent === "collect_inquiry" || conversation.state === "collecting") {
    return annotate(await replyCollect(deps, phone, classified, conversation));
  }
  return annotate(await replyFaq(deps, classified, conversation, text));
}
