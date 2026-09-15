export type OrderIntakeChannelRule = {
  id?: string;
  name: string;
  aliases?: string[];
  terms: string[];
  url?: string | null;
};

export type OrderIntakeRule = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  handling: "allow_only" | "manual_review";
  customerMessage?: string | null;
  channels: OrderIntakeChannelRule[];
};

export type OrderIntakeEvaluation = {
  status: "available" | "manual_review";
  message: string | null;
  matchedRuleIds: string[];
  recommendations: Array<{ name: string; url: string | null }>;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("zh-Hant").replace(/\s+/g, "");
}

function applies(input: { date: string; time?: string | null }, rule: OrderIntakeRule) {
  if (input.date < rule.startsOn || input.date > rule.endsOn) return false;
  if (!rule.startTime || !rule.endTime) return true;
  if (!input.time) return true; // The date is restricted; collect time before promising a slot.
  return input.time >= rule.startTime && input.time < rule.endTime;
}

function matchesAllowedChannel(text: string, channel: OrderIntakeChannelRule) {
  const body = normalize(text);
  const brands = [channel.name, ...(channel.aliases ?? [])].map(normalize).filter(Boolean);
  const brandMatched = brands.some((brand) => body.includes(brand));
  const productTerms = channel.terms.map(normalize).filter((term) => term && !brands.includes(term));
  return brandMatched && productTerms.some((term) => body.includes(term));
}

export function evaluateOrderIntakeRules(
  input: { date: string; time?: string | null; text: string },
  rules: OrderIntakeRule[],
): OrderIntakeEvaluation {
  const matched = rules.filter((rule) => applies(input, rule));
  if (!matched.length) {
    return { status: "available", message: null, matchedRuleIds: [], recommendations: [] };
  }
  const allowRules = matched.filter((rule) => rule.handling === "allow_only");
  const forcedReview = matched.some((rule) => rule.handling === "manual_review");
  const allowed = allowRules.length > 0 && allowRules.some((rule) =>
    rule.channels.some((channel) => matchesAllowedChannel(input.text, channel))
  );
  const recommendations = [...new Map(
    allowRules.flatMap((rule) => rule.channels).map((channel) => [
      normalize(channel.name),
      { name: channel.name, url: channel.url || null },
    ]),
  ).values()];
  const status = !forcedReview && allowed ? "available" : "manual_review";
  return {
    status,
    message: matched.map((rule) => rule.customerMessage?.trim()).find(Boolean) || null,
    matchedRuleIds: matched.map((rule) => rule.id),
    recommendations,
  };
}
