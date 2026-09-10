import {
  classifyCustomerServiceMessage,
  customerServiceMenuFaqQuery,
  extractRequestedOrderFields,
  hasCollectableSlots,
  isCustomerServiceGreeting,
  isMenuInformationRequest,
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
  lookupNoOrdersReply,
  lookupNotFoundReply,
  lookupRequestedOrderReply,
  REPLIES,
  sanitizeOutboundReply,
} from "./customer-service-replies.ts";
import {
  decideCustomerServicePilotAction,
  inferCustomerServicePilotGoal,
  type CustomerServicePilotGoal,
} from "./customer-service-pilot-graph.ts";
import type { CustomerServiceRecentMessage } from "./customer-service-context.ts";

export type CustomerServiceTaskSnapshot = {
  goal: CustomerServicePilotGoal;
  state: CustomerServiceConversation["state"];
  selectedOrderId: string | null;
  handoffAt: string | null;
  pendingRequest: string | null;
  workflowSlots: Record<string, unknown>;
};

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

export type CustomerServiceOrderItem = {
  order_line_id: string;
  package_name: string | null;
  item_kind?: "package" | "package_item" | "utensil" | "item";
  item_name: string;
  item_content: string | null;
  quantity: number | null;
  quantity_text: string | null;
  remarks: string[];
};

export type CustomerServiceConversation = {
  phone_normalized: string;
  state:
    | "identifying"
    | "verifying_order"
    | "picking_order"
    | "picking_handoff_order"
    | "collecting"
    | "awaiting_human"
    | "human_owned";
  selected_order_id: string | null;
  handoff_at: string | null;
  pending_request: string | null;
  active_goal?: CustomerServicePilotGoal | null;
  workflow_slots?: Record<string, unknown>;
  workflow_version?: number;
  suspended_goals?: CustomerServiceTaskSnapshot[];
  recent_messages?: CustomerServiceRecentMessage[];
  identity_verified_at?: string | null;
  identity_verification_method?: string | null;
  identity_verification_order_id?: string | null;
  identity_verification_attempts?: number;
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
  workflowAutoResume?: Partial<Record<CustomerServicePilotGoal, boolean>>;
  replyTemplates?: Partial<
    Record<
      | "help"
      | "handoff"
      | "collect_prompt"
      | "collect_more"
      | "collect_done"
      | "no_faq"
      | "refuse",
      string
    >
  >;
  lookupOrders: (phone: string) => Promise<CustomerServiceOrder[]>;
  lookupOrderItems: (
    phone: string,
    orderId: string,
  ) => Promise<CustomerServiceOrderItem[]>;
  verifyOrderIdentity: (
    phone: string,
    orderId: string,
    answer: string,
  ) => Promise<boolean>;
  writeInquiry: (
    phone: string,
    slots: InquirySlots,
    anotherEvent: boolean,
  ) => Promise<CustomerServiceInquiryWrite>;
  searchFaqs: (query: string) => Promise<CustomerServiceFaqHit[]>;
  answerFaqWithModel?: (
    query: string,
    candidates: CustomerServiceFaqHit[],
  ) => Promise<
    string | { answer: string; sourceIds: string[]; model: string } | null
  >;
  queueHandoff: (input: {
    phone: string;
    quoteId: string | null;
    orderNumber: string | null;
    summary: string;
    kind?: "inquiry" | "order_handoff";
  }) => Promise<void>;
  cancelHandoff: (phone: string) => Promise<boolean>;
};

export type BotTurn = {
  reply: string | null;
  conversation: CustomerServiceConversation;
  wroteInquiry: boolean;
  notified: boolean;
  queuedHandoff?: boolean;
  usedModel: boolean;
  intentKey?: string;
  confidence?: number;
  toolKeys?: string[];
  failureReason?: string | null;
  faqSourceIds?: string[];
  model?: string | null;
  dialogAction?: ClassifiedMessage["dialogAction"];
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
  return !/已送達|己送達|已經送達|delivered|已取消|己取消|取消|cancelled/i.test(
    status,
  );
}

function normalizedFaqText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s，。！？、,.!?：:；;（）()「」『』"']/g, "")
    .replace(/^(請問|想問|我想問|可唔可以問)/, "");
}

function strongPublishedFaqMatch(query: string, hit: CustomerServiceFaqHit) {
  const left = normalizedFaqText(query);
  const right = normalizedFaqText(hit.question);
  if (!left || !right) return false;
  if (left === right) return true;
  return Math.min(left.length, right.length) >= 5 &&
    Math.abs(left.length - right.length) <= 5 &&
    (left.includes(right) || right.includes(left));
}

function isMenuFaq(hit: CustomerServiceFaqHit) {
  return hit.category === "menu" && /(?:餐牌|菜單|菜单|menu)/i.test(hit.question);
}

function resetPilotConversation(conversation: CustomerServiceConversation) {
  return nextConversation(conversation, {
    state: "identifying",
    selected_order_id: null,
    handoff_at: null,
    pending_request: null,
    active_goal: null,
    workflow_slots: {},
    workflow_version: 1,
    suspended_goals: [],
  });
}

function suspendPilotConversation(
  conversation: CustomerServiceConversation,
  goal: CustomerServicePilotGoal,
) {
  const snapshot: CustomerServiceTaskSnapshot = {
    goal,
    state: conversation.state,
    selectedOrderId: conversation.selected_order_id,
    handoffAt: conversation.handoff_at,
    pendingRequest: conversation.pending_request,
    workflowSlots: conversation.workflow_slots ?? {},
  };
  return nextConversation(resetPilotConversation(conversation), {
    suspended_goals: [...(conversation.suspended_goals ?? []), snapshot].slice(-3),
  });
}

function restoreSuspendedConversation(conversation: CustomerServiceConversation) {
  const stack = [...(conversation.suspended_goals ?? [])];
  const snapshot = stack.pop();
  if (!snapshot) return null;
  return nextConversation(conversation, {
    state: snapshot.state,
    selected_order_id: snapshot.selectedOrderId,
    handoff_at: snapshot.handoffAt,
    pending_request: snapshot.pendingRequest,
    active_goal: snapshot.goal,
    workflow_slots: snapshot.workflowSlots,
    suspended_goals: stack,
  });
}

function normalizedDialogControl(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？、,.!?]/g, "");
}

function latestBurstMessage(value: string) {
  const latest = value.trim().split(/\r?\n/).at(-1) || value;
  return latest.replace(/^\[訊息\s+\d+\]\s*/, "").trim();
}

function isCancelCurrentTaskMessage(value: string) {
  const latest = latestBurstMessage(value);
  if (latest !== value.trim() && isCancelCurrentTaskMessage(latest)) return true;
  const text = normalizedDialogControl(value);
  if (!text) return false;
  if (/^(取消|撤回|算了|算啦|當我冇講|当我没说)$/.test(text)) return true;
  if (/(?:取消|撤回|停止).*(?:訂餐|订餐|落單|下单|查單|查单|查詢|查询|報價|报价|到會|到会|修改|更改|改期|申請|申请|請求|请求|要求|操作|流程)/.test(text)) return true;
  if (/(?:訂餐|订餐|落單|下单|查單|查单|查詢|查询|報價|报价|到會|到会|修改|更改|改期|申請|申请).*(?:取消|撤回|停止|唔使|不用|不要)/.test(text)) return true;
  return /(?:唔使|不用|不要)(?:再)?(?:訂|订|落單|下单|查|查單|查单|報價|报价|改|修改|更改|改期|取消|處理|处理)(?:啦|了)?$/.test(text);
}

function isExplicitPreviousHandoffCancellation(value: string) {
  const latest = latestBurstMessage(value);
  if (latest !== value.trim() && isExplicitPreviousHandoffCancellation(latest)) return true;
  const text = value.trim().replace(/[\s，。！？、,.!?]/g, "");
  return /(?:取消|撤回).*(?:之前|先前|上次|頭先|刚才|剛才).*(?:訂單|订单)?(?:修改|更改|改期|申請|申请)/.test(text);
}

/** When false, WhatsApp bot skips asking for order email before lookup/handoff. */
const ORDER_EMAIL_IDENTITY_VERIFICATION_ENABLED = false;

function identityChallengeReply(order: CustomerServiceOrder) {
  return sanitizeOutboundReply(
    `為保障訂單私隱，請輸入訂單 ${order.order_number || ""} 落單時使用的完整電郵地址作核實。`,
  );
}

function identityFailedReply(attempts: number) {
  return sanitizeOutboundReply(
    attempts >= 3
      ? "核實未成功，請重新提供訂單號碼再試；如仍有問題，可以要求真人協助。"
      : "電郵資料未能核實，請確認後重新輸入落單時使用的完整電郵地址。",
  );
}

function hasVerifiedIdentity(conversation: CustomerServiceConversation) {
  if (!ORDER_EMAIL_IDENTITY_VERIFICATION_ENABLED) return true;
  if (!conversation.identity_verified_at) return false;
  return Date.now() - new Date(conversation.identity_verified_at).getTime() < 30 * 60 * 1_000;
}

function parseLookupPendingRequest(pendingRequest: string | null) {
  if (!pendingRequest?.startsWith("lookup:")) return ["summary"];
  const allowed = new Set([
    "summary",
    "delivery_date",
    "status",
    "items",
    "address",
    "receipt",
  ]);
  const fields = pendingRequest.slice("lookup:".length)
    .split(",")
    .map((field) => field.trim())
    .filter((field) => allowed.has(field));
  return fields.length ? fields : ["summary"];
}

async function lookupVerifiedOrderReply(
  deps: CustomerServiceBotDeps,
  phone: string,
  order: CustomerServiceOrder,
  requestedFields: string[],
) {
  let items: CustomerServiceOrderItem[] = [];
  let itemLookupFailed = false;
  if (requestedFields.includes("items")) {
    try {
      items = await deps.lookupOrderItems(phone, order.order_id);
    } catch (error) {
      itemLookupFailed = true;
      console.error("customer service order item lookup failed", error);
    }
  }
  return {
    reply: lookupRequestedOrderReply(order, items, {
      requestedFields,
      itemLookupFailed,
    }),
    failureReason: itemLookupFailed ? "order_items_lookup_failed" : undefined,
  };
}

function beginOrderVerification(
  order: CustomerServiceOrder,
  conversation: CustomerServiceConversation,
  pendingRequest: string,
  usedModel: boolean,
): BotTurn {
  return {
    reply: identityChallengeReply(order),
    conversation: nextConversation(conversation, {
      state: "verifying_order",
      selected_order_id: order.order_id,
      pending_request: pendingRequest,
      identity_verification_order_id: order.order_id,
      identity_verification_attempts: 0,
      active_goal: pendingRequest.startsWith("handoff:") ? "order_change" : null,
    }),
    wroteInquiry: false,
    notified: false,
    usedModel,
  };
}

async function finishOrderHandoff(
  deps: CustomerServiceBotDeps,
  phone: string,
  order: CustomerServiceOrder,
  request: string,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  await deps.queueHandoff({
    phone,
    quoteId: order.order_id,
    orderNumber: order.order_number,
    summary: `客戶要求人工處理：${request || "更改訂單"}`,
    kind: "order_handoff",
  });
  return {
    reply: handoffOrderSelectedReply(order.order_number || "（未有單號）"),
    conversation: nextConversation(conversation, {
      state: "awaiting_human",
      selected_order_id: order.order_id,
      handoff_at: new Date().toISOString(),
      pending_request: null,
      active_goal: "order_change",
    }),
    wroteInquiry: false,
    notified: false,
    queuedHandoff: true,
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
    const requested = normalizeCustomerServiceOrderNumber(
      classified.orderNumber,
    );
    const selected = orders.find(
      (order) =>
        normalizeCustomerServiceOrderNumber(order.order_number) === requested,
    );
    if (selected && !hasVerifiedIdentity(conversation))
      return beginOrderVerification(
        selected,
        conversation,
        `handoff:${pendingRequest}`,
        classified.usedModel,
      );
    if (selected)
      return finishOrderHandoff(
        deps,
        phone,
        selected,
        pendingRequest,
        conversation,
      );
  }
  if (orders.length) {
    return {
      reply: handoffOrderListReply(pendingRequest, orders),
      conversation: nextConversation(conversation, {
        state: "picking_handoff_order",
        selected_order_id: null,
        pending_request: pendingRequest,
        active_goal: "order_change",
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
    };
  }
  await deps.queueHandoff({
    phone,
    quoteId: null,
    orderNumber: null,
    summary: `客戶要求人工處理，但未找到未送貨訂單：${pendingRequest || "更改訂單"}`,
    kind: "order_handoff",
  });
  return {
    reply: handoffNoOpenOrderReply(),
    conversation: nextConversation(conversation, {
      state: "awaiting_human",
      selected_order_id: null,
      handoff_at: new Date().toISOString(),
      pending_request: null,
      active_goal: "order_change",
    }),
    wroteInquiry: false,
    notified: false,
    queuedHandoff: true,
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
  const requestedFields = conversation.pending_request?.startsWith("lookup:")
    ? parseLookupPendingRequest(conversation.pending_request)
    : classified.requestedFields?.length
      ? classified.requestedFields
      : ["summary"];
  if (classified.orderNumber) {
    const requestedOrderNumber = normalizeCustomerServiceOrderNumber(
      classified.orderNumber,
    );
    const selected = orders.find(
      (order) =>
        normalizeCustomerServiceOrderNumber(order.order_number) ===
        requestedOrderNumber,
    );
    if (selected) {
      if (!hasVerifiedIdentity(conversation)) {
        return beginOrderVerification(
          selected,
          conversation,
          `lookup:${requestedFields.join(",")}`,
          classified.usedModel,
        );
      }
      const result = await lookupVerifiedOrderReply(
        deps,
        phone,
        selected,
        requestedFields,
      );
      return {
        reply: result.reply,
        conversation: nextConversation(conversation, {
          state: "identifying",
          selected_order_id: selected.order_id,
          pending_request: null,
        }),
        wroteInquiry: false,
        notified: false,
        usedModel: classified.usedModel,
        failureReason: result.failureReason,
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
  const selectedOrder = conversation.selected_order_id
    ? orders.find((order) => order.order_id === conversation.selected_order_id)
    : null;
  if (selectedOrder && hasVerifiedIdentity(conversation)) {
    const result = await lookupVerifiedOrderReply(
      deps,
      phone,
      selectedOrder,
      requestedFields,
    );
    return {
      reply: result.reply,
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: selectedOrder.order_id,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
      failureReason: result.failureReason,
    };
  }
  if (orders.length === 1) {
    if (!hasVerifiedIdentity(conversation)) {
      return beginOrderVerification(
        orders[0],
        conversation,
        `lookup:${requestedFields.join(",")}`,
        classified.usedModel,
      );
    }
    const result = await lookupVerifiedOrderReply(
      deps,
      phone,
      orders[0],
      requestedFields,
    );
    return {
      reply: result.reply,
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: orders[0].order_id,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
      failureReason: result.failureReason,
    };
  }
  if (orders.length > 1) {
    return {
      reply: lookupListReply(orders),
      conversation: nextConversation(conversation, {
        state: "picking_order",
        selected_order_id: null,
        pending_request: `lookup:${requestedFields.join(",")}`,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  return {
    reply: lookupNoOrdersReply(classified.orderNumber || ""),
    conversation: nextConversation(conversation, {
      state: "identifying",
      selected_order_id: null,
      pending_request: null,
      active_goal: null,
    }),
    wroteInquiry: false,
    notified: false,
    usedModel: classified.usedModel,
  };
}

async function replyOrderVerification(
  deps: CustomerServiceBotDeps,
  phone: string,
  text: string,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  const orderId = conversation.identity_verification_order_id || conversation.selected_order_id;
  if (!orderId) {
    return {
      reply: identityFailedReply(3),
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
        pending_request: null,
        identity_verification_attempts: 0,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verification_context_missing",
    };
  }
  const verified = await deps.verifyOrderIdentity(phone, orderId, text.trim());
  if (!verified) {
    const attempts = (conversation.identity_verification_attempts ?? 0) + 1;
    return {
      reply: identityFailedReply(attempts),
      conversation: nextConversation(conversation, {
        state: attempts >= 3 ? "identifying" : "verifying_order",
        selected_order_id: attempts >= 3 ? null : orderId,
        pending_request: attempts >= 3 ? null : conversation.pending_request,
        identity_verification_order_id: attempts >= 3 ? null : orderId,
        identity_verification_attempts: attempts,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verification_failed",
    };
  }
  const orders = await deps.lookupOrders(phone);
  const selected = orders.find((order) => order.order_id === orderId);
  if (!selected) {
    return {
      reply: identityFailedReply(3),
      conversation: nextConversation(conversation, { state: "identifying", selected_order_id: null }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verified_order_missing",
    };
  }
  const verifiedConversation = nextConversation(conversation, {
    state: "identifying",
    selected_order_id: orderId,
    identity_verified_at: new Date().toISOString(),
    identity_verification_method: "order_email",
    identity_verification_order_id: orderId,
    identity_verification_attempts: 0,
  });
  const pending = conversation.pending_request || "lookup";
  if (pending.startsWith("handoff:")) {
    return finishOrderHandoff(
      deps,
      phone,
      selected,
      pending.slice("handoff:".length),
      verifiedConversation,
    );
  }
  const result = await lookupVerifiedOrderReply(
    deps,
    phone,
    selected,
    parseLookupPendingRequest(pending),
  );
  return {
    reply: result.reply,
    conversation: nextConversation(verifiedConversation, { pending_request: null }),
    wroteInquiry: false,
    notified: false,
    usedModel: false,
    failureReason: result.failureReason,
  };
}

async function replyCollect(
  deps: CustomerServiceBotDeps,
  phone: string,
  classified: ClassifiedMessage,
  conversation: CustomerServiceConversation,
): Promise<BotTurn> {
  const saved = conversation.workflow_slots ?? {};
  const slots: InquirySlots = {
    eventDate: classified.slots.eventDate || String(saved.eventDate ?? ""),
    headcount: classified.slots.headcount || String(saved.headcount ?? ""),
    budget: classified.slots.budget || String(saved.budget ?? ""),
    dietary: classified.slots.dietary || String(saved.dietary ?? ""),
    cuisine: classified.slots.cuisine || String(saved.cuisine ?? ""),
    note: classified.slots.note || String(saved.note ?? ""),
    anotherEvent: classified.slots.anotherEvent || Boolean(saved.anotherEvent),
  };
  if (!hasCollectableSlots(slots)) {
    return {
      reply:
        conversation.state === "collecting"
          ? configuredReply(deps, "collect_more", REPLIES.collectMore)
          : configuredReply(deps, "collect_prompt", REPLIES.collectPrompt),
      conversation: nextConversation(conversation, {
        state: "collecting",
        active_goal: "catering_inquiry",
        workflow_slots: slots,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    };
  }
  const written = await deps.writeInquiry(
    phone,
    slots,
    slots.anotherEvent,
  );
  const summary = [
    slots.eventDate && `日期 ${slots.eventDate}`,
    slots.headcount && `人數 ${slots.headcount}`,
    slots.budget,
    slots.dietary,
    slots.cuisine,
  ]
    .filter(Boolean)
    .join("，");
  await deps.queueHandoff({
    phone,
    quoteId: written.quote_id,
    orderNumber: written.order_number,
    summary,
  });
  const restored = deps.workflowAutoResume?.catering_inquiry === false
    ? null
    : restoreSuspendedConversation(conversation);
  return {
    reply: `${configuredReply(deps, "collect_done", REPLIES.collectDone)}${
      restored ? " 已返回上一個未完成事項。" : ""
    }`,
    conversation: restored ?? resetPilotConversation(conversation),
    wroteInquiry: true,
    notified: false,
    queuedHandoff: true,
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
      const answer =
        typeof modelAnswer === "string" ? modelAnswer : modelAnswer?.answer;
      if (answer) {
        return {
          reply: faqReply(answer),
          conversation,
          wroteInquiry: false,
          notified: false,
          usedModel: true,
          faqSourceIds:
            typeof modelAnswer === "string"
              ? []
              : (modelAnswer?.sourceIds ?? []),
          model:
            typeof modelAnswer === "string"
              ? null
              : (modelAnswer?.model ?? null),
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

  const hasActiveTask = conversation.state !== "identifying";
  const explicitPreviousCancellation = isExplicitPreviousHandoffCancellation(text);
  if (
    (hasActiveTask && isCancelCurrentTaskMessage(text))
    || explicitPreviousCancellation
  ) {
    const isQueuedHandoff = conversation.state === "awaiting_human" || explicitPreviousCancellation;
    if (isQueuedHandoff) {
      const cancelled = await deps.cancelHandoff(phone);
      if (!cancelled && conversation.state !== "awaiting_human") {
        return {
          reply: REPLIES.noPendingHandoff,
          conversation,
          wroteInquiry: false,
          notified: false,
          queuedHandoff: false,
          usedModel: false,
        };
      }
    }
    return {
      reply: isQueuedHandoff ? REPLIES.handoffCancelled : REPLIES.currentTaskCancelled,
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
        handoff_at: null,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: false,
      usedModel: false,
    };
  }

  if (conversation.state === "verifying_order") {
    if (ORDER_EMAIL_IDENTITY_VERIFICATION_ENABLED) {
      return await replyOrderVerification(deps, phone, text, conversation);
    }
    // Challenge disabled: clear stuck verification and resume pending request.
    const orderId =
      conversation.identity_verification_order_id || conversation.selected_order_id;
    const orders = await deps.lookupOrders(phone);
    const selected = orderId
      ? orders.find((order) => order.order_id === orderId)
      : null;
    if (selected) {
      const resumed = nextConversation(conversation, {
        state: "identifying",
        selected_order_id: selected.order_id,
        identity_verified_at: new Date().toISOString(),
        identity_verification_method: null,
        identity_verification_order_id: null,
        identity_verification_attempts: 0,
      });
      const pending = conversation.pending_request || "lookup";
      if (pending.startsWith("handoff:")) {
        return finishOrderHandoff(
          deps,
          phone,
          selected,
          pending.slice("handoff:".length),
          resumed,
        );
      }
      const result = await lookupVerifiedOrderReply(
        deps,
        phone,
        selected,
        parseLookupPendingRequest(pending),
      );
      return {
        reply: result.reply,
        conversation: nextConversation(resumed, { pending_request: null }),
        wroteInquiry: false,
        notified: false,
        usedModel: false,
        failureReason: result.failureReason,
      };
    }
    return {
      reply: lookupNoOrdersReply(""),
      conversation: nextConversation(conversation, {
        state: "identifying",
        selected_order_id: null,
        identity_verification_order_id: null,
        identity_verification_attempts: 0,
        pending_request: null,
      }),
      wroteInquiry: false,
      notified: false,
      usedModel: false,
      failureReason: "identity_verification_context_missing",
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

  const faqSearchCache = new Map<string, Promise<CustomerServiceFaqHit[]>>();
  const searchFaqsOnce = (query: string) => {
    const key = normalizedFaqText(query);
    const existing = faqSearchCache.get(key);
    if (existing) return existing;
    const pending = deps.searchFaqs(query).catch((error) => {
      faqSearchCache.delete(key);
      throw error;
    });
    faqSearchCache.set(key, pending);
    return pending;
  };
  const cachedDeps: CustomerServiceBotDeps = {
    ...deps,
    searchFaqs: searchFaqsOnce,
  };

  // Published, strongly matching FAQ knowledge is authoritative for stable
  // public information. Resolve it before intent classification so words such
  // as "廚師" do not get mistaken for a request requiring kitchen approval.
  try {
    const asksForMenu = isMenuInformationRequest(text);
    const menuQuery = asksForMenu ? customerServiceMenuFaqQuery(text) : "";
    const faqHits = await searchFaqsOnce(asksForMenu ? menuQuery : text);
    const preferredFaq = asksForMenu
      ? faqHits.find((hit) => strongPublishedFaqMatch(menuQuery, hit)) ??
        faqHits.find(isMenuFaq)
      : faqHits.find((hit) => strongPublishedFaqMatch(text, hit));
    if (preferredFaq) {
      return {
        reply: faqReply(preferredFaq.answer),
        conversation,
        wroteInquiry: false,
        notified: false,
        usedModel: false,
        intentKey: asksForMenu ? "browse_menu" : "search_faq",
        toolKeys: ["search_faqs"],
        faqSourceIds: [preferredFaq.id],
        failureReason: null,
      };
    }
  } catch (error) {
    console.error(
      "customer-service FAQ preflight failed",
      error instanceof Error ? error.message.slice(0, 200) : String(error),
    );
  }

  const modelClassified = await classify(text);
  // The current utterance is authoritative for the requested order fields.
  // This prevents recent context (for example, a previous dish lookup) from
  // making the model repeat the old field for a new delivery-time follow-up.
  const explicitRequestedFields = extractRequestedOrderFields(text);
  const classified = explicitRequestedFields.length
    ? { ...modelClassified, requestedFields: explicitRequestedFields }
    : modelClassified;
  const annotate = (turn: BotTurn): BotTurn => {
    const defaultTool = classified.intent === "lookup_order" ||
        classified.intent === "handoff_order"
      ? "lookup_orders"
      : classified.intent === "search_faq"
        ? "search_faqs"
        : null;
    return {
      ...turn,
      intentKey: classified.configuredIntentKey || classified.intent,
      confidence: classified.confidence,
      toolKeys: [...new Set([
        ...(turn.toolKeys ?? []),
        classified.toolKey,
        defaultTool,
      ].filter((tool): tool is string => Boolean(tool)))],
      failureReason: turn.failureReason ?? null,
      model: turn.model ?? classified.model ?? null,
      dialogAction: classified.dialogAction,
    };
  };
  if (classified.needsClarification) {
    return annotate({
      reply: sanitizeOutboundReply(
        classified.clarificationQuestion ||
          "我想確認清楚：你係想繼續目前事項、取消目前事項，定係提出另一個要求？",
      ),
      conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    });
  }
  const activeGoal = inferCustomerServicePilotGoal({
    activeGoal: conversation.active_goal,
    state: conversation.state,
    pendingRequest: conversation.pending_request,
    selectedOrderId: conversation.selected_order_id,
  });
  const pilotAction = await decideCustomerServicePilotAction({
    activeGoal,
    conversationState: conversation.state,
    classified,
  });
  if (pilotAction === "resume_previous") {
    const restored = restoreSuspendedConversation(conversation);
    return annotate({
      reply: restored
        ? "好，已返回上一個未完成事項，你可以繼續補充資料。"
        : "目前沒有暫停中的事項。你可以直接告訴我想查詢或處理甚麼。",
      conversation: restored ?? conversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    });
  }
  if (pilotAction === "cancel_current") {
    const queued = conversation.state === "awaiting_human";
    if (queued) await deps.cancelHandoff(phone);
    const restored = restoreSuspendedConversation(conversation);
    return annotate({
      reply: `${queued ? REPLIES.handoffCancelled : REPLIES.currentTaskCancelled}${
        restored ? " 已返回上一個未完成事項。" : ""
      }`,
      conversation: restored ?? resetPilotConversation(conversation),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: false,
      usedModel: classified.usedModel,
    });
  }
  if (
    conversation.state === "awaiting_human" &&
    pilotAction === "continue_order_change"
  ) {
    await deps.queueHandoff({
      phone,
      quoteId: conversation.selected_order_id,
      orderNumber: null,
      summary: `客戶補充資料：${text.trim().slice(0, 500)}`,
      kind: "order_handoff",
    });
    return annotate({
      reply: REPLIES.handoffQueued,
      conversation,
      wroteInquiry: false,
      notified: false,
      queuedHandoff: true,
      usedModel: classified.usedModel,
    });
  }
  const routedConversation = activeGoal && (
      pilotAction === "start_order_change" ||
      pilotAction === "start_catering"
    )
    ? suspendPilotConversation(conversation, activeGoal)
    : conversation;
  if (
    conversation.state === "picking_handoff_order" &&
    pilotAction === "continue_order_change"
  ) {
    return annotate(
      await replyOrderHandoff(deps, phone, classified, conversation, text),
    );
  }
  if (conversation.state === "picking_order" && classified.orderNumber) {
    return annotate(await replyLookup(deps, phone, classified, conversation));
  }
  if (
    classified.intent === "prompt_injection" ||
    classified.intent === "out_of_scope"
  ) {
    return annotate({
      reply: configuredReply(deps, "refuse", REPLIES.refuse),
      conversation: routedConversation,
      wroteInquiry: false,
      notified: false,
      usedModel: classified.usedModel,
    });
  }
  if (classified.intent === "handoff") {
    await deps.queueHandoff({
      phone,
      quoteId: null,
      orderNumber: null,
      summary: `客戶要求人工協助：${text.trim().slice(0, 500)}`,
      kind: "order_handoff",
    });
    return annotate({
      reply: configuredReply(deps, "handoff", REPLIES.handoff),
      conversation: nextConversation(routedConversation, {
        state: "awaiting_human",
        handoff_at: new Date().toISOString(),
      }),
      wroteInquiry: false,
      notified: false,
      queuedHandoff: true,
      usedModel: classified.usedModel,
    });
  }
  if (classified.intent === "handoff_order") {
    return annotate(
      await replyOrderHandoff(deps, phone, classified, routedConversation, text),
    );
  }
  if (classified.intent === "lookup_order") {
    return annotate(await replyLookup(deps, phone, classified, routedConversation));
  }
  if (
    classified.intent === "collect_inquiry" ||
    pilotAction === "continue_catering"
  ) {
    return annotate(await replyCollect(deps, phone, classified, routedConversation));
  }
  const faqQuery = classified.configuredIntentKey === "browse_menu" ||
      isMenuInformationRequest(text)
    ? customerServiceMenuFaqQuery(text)
    : text;
  return annotate(await replyFaq(cachedDeps, classified, routedConversation, faqQuery));
}
