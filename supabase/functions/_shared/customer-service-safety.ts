export type SafetyRoute =
  | { kind: "none" }
  | { kind: "human"; route: "general" | "order_change" }
  | { kind: "refuse" };

export type SafetyEvidence = {
  injection: boolean;
  changeAction: boolean;
  cancelAction: boolean;
  policyQuestion: boolean;
  complaint: boolean;
  negatedAction: boolean;
  orderNumber: string;
};

export type SafetyGuardResult = {
  route: SafetyRoute;
  evidence: SafetyEvidence;
  override: boolean;
  note: string | null;
};

const INJECTION =
  /忽略(以上|之前|先前)|ignore\s*(all|previous|above|prior)\s*(instructions|prompts)|you\s*are\s*now|扮演|假裝你係|列出(你的|你嘅)?工具|你是(什麼|什么)模型|你係(乜|咩)(模型|model)|system\s*prompt|越獄|jailbreak/i;

const CHANGE_VERB =
  /改期|改地址|改時間|改人數|改送貨|改自取|改做|更改|修改|轉做|轉送貨/;

const CANCEL_VERB = /取消|退款|退錢|退單/;

const HANDOFF = /投訴|服務差|議價|平啲|減價|便宜/;

const DESTRUCTIVE_OBJECT =
  /(張|呢張|嗰張|我張|我嘅)?\s*(單|訂單|order|booking|預訂|訂位)/i;

const IMPERATIVE = /幫我|我想|我要|唔要|不要|取消佢/;

const POLICY_FORM =
  /政策|須知|條款|規矩|程序|流程|手續|資格|條件|限制|費用|手續費|幾多錢|幾耐|幾時|點樣|點解|係咪|是否|可否|可唔可以/;

const NEGATION_MARKER = /唔係|唔想|唔要|唔使|唔洗|唔改|唔取消|先唔|先不|不用|不要|不會|本來想.*但/;

const CLAUSE_BOUNDARY = /[，。！？；]|但係|不過|而家|先|住/;

export function detectSafetyEvidence(
  text: string,
  orderNumber = "",
): SafetyEvidence {
  const body = text.trim();
  const injection = INJECTION.test(body);
  const clauses = body.split(CLAUSE_BOUNDARY).filter((c) => c.trim());
  const fullTextNegated = /本來想.*但.*唔|原本想.*但.*唔/.test(body);

  let changeAction = false;
  let cancelAction = false;
  let negatedAction = false;
  let complaint = false;

  for (const clause of clauses) {
    const negated = fullTextNegated || NEGATION_MARKER.test(clause);
    const hasChange = CHANGE_VERB.test(clause);
    const hasCancel = CANCEL_VERB.test(clause);
    const hasObject = DESTRUCTIVE_OBJECT.test(clause) || Boolean(orderNumber) || IMPERATIVE.test(clause);
    const isPolicy = POLICY_FORM.test(clause) && !hasObject;

    if (negated) {
      negatedAction = true;
    } else {
      if (hasChange && !isPolicy) changeAction = true;
      if (hasCancel && !isPolicy && hasObject) cancelAction = true;
      if (HANDOFF.test(clause)) complaint = true;
    }
  }

  const policyQuestion =
    POLICY_FORM.test(body) && !changeAction && !cancelAction;

  return {
    injection,
    changeAction,
    cancelAction,
    policyQuestion,
    complaint,
    negatedAction,
    orderNumber,
  };
}

const ROUTE_PRECEDENCE: Record<SafetyRoute["kind"], number> = {
  none: 0,
  human: 1,
  refuse: 2,
};

function routeFromEvidence(evidence: SafetyEvidence): SafetyRoute {
  if (evidence.injection) return { kind: "refuse" };
  if (evidence.changeAction || evidence.cancelAction) {
    return { kind: "human", route: "order_change" };
  }
  if (evidence.complaint) return { kind: "human", route: "general" };
  return { kind: "none" };
}

function routeFromClassified(
  intent: string | undefined,
  requiresHuman: boolean,
): SafetyRoute {
  if (intent === "prompt_injection") return { kind: "refuse" };
  if (intent === "handoff_order") return { kind: "human", route: "order_change" };
  if (intent === "handoff") return { kind: "human", route: "general" };
  if (requiresHuman) return { kind: "human", route: "general" };
  return { kind: "none" };
}

function isMoreSpecific(a: SafetyRoute, b: SafetyRoute): boolean {
  if (a.kind !== b.kind) return ROUTE_PRECEDENCE[a.kind] > ROUTE_PRECEDENCE[b.kind];
  if (a.kind === "human" && b.kind === "human") {
    return a.route === "order_change" && b.route === "general";
  }
  return false;
}

export function mergeSafetyRoutes(
  evidenceRoute: SafetyRoute,
  modelRoute: SafetyRoute,
): { route: SafetyRoute; override: boolean } {
  if (isMoreSpecific(evidenceRoute, modelRoute)) {
    return { route: evidenceRoute, override: true };
  }
  return { route: modelRoute, override: false };
}

export function applyClassificationSafetyGuards(input: {
  text: string;
  classified: {
    intent?: string;
    requiresHuman?: boolean;
  };
  orderNumber?: string;
}): SafetyGuardResult {
  const evidence = detectSafetyEvidence(input.text, input.orderNumber ?? "");
  const evidenceRoute = routeFromEvidence(evidence);
  const modelRoute = routeFromClassified(
    input.classified.intent,
    Boolean(input.classified.requiresHuman),
  );
  const { route, override } = mergeSafetyRoutes(evidenceRoute, modelRoute);

  let note: string | null = null;
  if (evidence.policyQuestion && !evidence.changeAction && !evidence.cancelAction) {
    note = "policy_form_suppressed";
  } else if (evidence.negatedAction && !evidence.changeAction && !evidence.cancelAction) {
    note = "negation_suppressed";
  }

  return { route, evidence, override, note };
}

export function safetyRouteToIntent(route: SafetyRoute): {
  intent: string;
  requiresHuman: boolean;
} | null {
  if (route.kind === "refuse") return { intent: "prompt_injection", requiresHuman: false };
  if (route.kind === "human" && route.route === "order_change") {
    return { intent: "handoff_order", requiresHuman: true };
  }
  if (route.kind === "human" && route.route === "general") {
    return { intent: "handoff", requiresHuman: true };
  }
  return null;
}
