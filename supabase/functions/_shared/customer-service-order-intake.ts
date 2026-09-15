export type OrderIntakeChannelRule = {
  id?: string;
  channelId?: string;
  name: string;
  aliases?: string[];
  terms: string[];
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
  requiresTime?: boolean;
  selectedRecommendation?: { name: string; url: string | null } | null;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("zh-Hant").replace(/\s+/g, "");
}

export function findUnavailableRequestedChannel(
  text: string,
  channels: Array<{ id: string; name: string }>,
  allowedChannelIds: Iterable<string>,
) {
  const body = normalize(text);
  const allowed = new Set(allowedChannelIds);
  return channels.find((channel) => {
    if (allowed.has(channel.id)) return false;
    const fullName = normalize(channel.name);
    const aliases = [
      fullName,
      fullName.replace(/^hk/, ""),
      fullName.replace(/^foodchannels/, ""),
    ].filter((term, index, values) => term.length >= 4 && values.indexOf(term) === index);
    return aliases.some((term) => body.includes(term));
  }) ?? null;
}

export function findOrderIntakeRecommendation(
  text: string,
  recommendations: Array<{ name: string; url: string | null }>,
) {
  const body = normalize(text);
  return recommendations.find((recommendation) => {
    const names = [
      recommendation.name,
      recommendation.name.replace(/^【[^】]+】\s*/, ""),
      recommendation.name
        .replace(/^【[^】]+】\s*/, "")
        .replace(/\s*[（(][^）)]*[）)]\s*$/, ""),
    ].map(normalize).filter((name, index, values) =>
      name.length >= 4 && values.indexOf(name) === index
    );
    return names.some((name) => body.includes(name));
  }) ?? null;
}

function applies(input: { date: string; time?: string | null }, rule: OrderIntakeRule) {
  if (input.date < rule.startsOn || input.date > rule.endsOn) return false;
  if (!rule.startTime || !rule.endTime) return true;
  if (!input.time) return false;
  return input.time >= rule.startTime && input.time < rule.endTime;
}

function matchesRequestedBrand(text: string, channel: OrderIntakeChannelRule) {
  const body = normalize(text);
  const brands = [channel.name, ...(channel.aliases ?? [])].map(normalize).filter(Boolean);
  return brands.some((brand) => body.includes(brand));
}

function matchesAllowedChannel(text: string, channel: OrderIntakeChannelRule) {
  const body = normalize(text);
  const brands = [channel.name, ...(channel.aliases ?? [])].map(normalize).filter(Boolean);
  const productTerms = channel.terms.map(normalize).filter((term) => term && !brands.includes(term));
  return matchesRequestedBrand(text, channel) && productTerms.some((term) => body.includes(term));
}

export function evaluateOrderIntakeRules(
  input: { date: string; time?: string | null; text: string },
  rules: OrderIntakeRule[],
): OrderIntakeEvaluation {
  const requiresTime = !input.time && rules.some((rule) =>
    input.date >= rule.startsOn && input.date <= rule.endsOn && rule.startTime && rule.endTime
  );
  const matched = rules.filter((rule) => applies(input, rule));
  if (!matched.length) {
    return { status: "available", message: null, matchedRuleIds: [], recommendations: [], requiresTime };
  }
  const allowRules = matched.filter((rule) => rule.handling === "allow_only");
  const forcedReview = matched.some((rule) => rule.handling === "manual_review");
  const allowed = allowRules.length > 0 && allowRules.every((rule) =>
    rule.channels.some((channel) => matchesAllowedChannel(input.text, channel))
  );
  const recommendations = [...new Map(
    allowRules.flatMap((rule) => rule.channels).map((channel) => [
      normalize(channel.name),
      { name: channel.name, url: null },
    ]),
  ).values()];
  const status = !forcedReview && allowed ? "available" : "manual_review";
  return {
    status,
    message: [
      ...matched.filter((rule) => rule.handling === "manual_review"),
      ...matched.filter((rule) => rule.handling !== "manual_review"),
    ].map((rule) => rule.customerMessage?.trim()).find(Boolean) || null,
    matchedRuleIds: matched.map((rule) => rule.id),
    recommendations,
    requiresTime,
  };
}

/** Search each channel with its own product terms, then intersect overlapping restrictions. */
export async function evaluateOrderIntakeWithCatalog(
  input: { date: string; time?: string | null; text: string },
  rules: OrderIntakeRule[],
  search: (channelId: string, terms: string[]) => Promise<OrderIntakeEvaluation["recommendations"]>,
): Promise<OrderIntakeEvaluation> {
  const evaluation = evaluateOrderIntakeRules(input, rules);
  const matched = rules.filter((rule) => evaluation.matchedRuleIds.includes(rule.id));
  const allowRules = matched.filter((rule) => rule.handling === "allow_only");
  if (!allowRules.length) return evaluation;
  const cache = new Map<string, ReturnType<typeof search>>();
  const productsByRule = await Promise.all(allowRules.map(async (rule) => {
    const results = await Promise.all(rule.channels.map(async (channel) => {
      const terms = channel.terms.map((term) => term.trim()).filter(Boolean);
      if (!channel.channelId || !terms.length) return [];
      const key = JSON.stringify([channel.channelId, terms]);
      if (!cache.has(key)) cache.set(key, search(channel.channelId, terms));
      return (await cache.get(key)!).map((product) => ({ ...product, channelId: channel.channelId }));
    }));
    return results.flat().filter((product) => product.url);
  }));
  const recommendations = [...new Map(productsByRule.flat()
    .filter((product) => productsByRule.every((products) => products.some((item) => item.url === product.url)))
    .map((product) => [product.url, product])).values()];
  const requestedChannels = new Set(allowRules.flatMap((rule) => rule.channels)
    .filter((channel) => matchesRequestedBrand(input.text, channel)).map((channel) => channel.channelId));
  const selected = findOrderIntakeRecommendation(input.text, recommendations.filter((product) =>
    !requestedChannels.size || requestedChannels.has(product.channelId),
  ));
  return {
    ...evaluation,
    status: selected && !matched.some((rule) => rule.handling === "manual_review")
      ? "available" : evaluation.status,
    recommendations,
    selectedRecommendation: selected,
  };
}
