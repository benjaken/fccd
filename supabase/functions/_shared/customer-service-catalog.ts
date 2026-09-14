import type { CustomerServiceRecentMessage } from "./customer-service-context.ts";

export type CustomerServiceCatalogCandidate = {
  id: string;
  sku: string | null;
  name: string;
  price: number | null;
  channelName: string | null;
};

export type CustomerServiceCatalogHit = CustomerServiceCatalogCandidate & {
  imageUrl: string | null;
  productUrl: string | null;
  items: string[];
};

export type CustomerServiceCatalogShopifyMapping = {
  internalPackageId: string;
  storeId: string;
  shopifyProductId: string;
  shopDomain: string;
  channelName: string | null;
};

export type CustomerServiceCatalogShopifyDraft = {
  storeId: string;
  shopifyProductId: string;
  handle: string;
  imageUrl: string | null;
};

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  兩: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function chineseInteger(value: string) {
  if (value === "十") return 10;
  const [tens, units] = value.split("十");
  if (units === undefined) return CHINESE_DIGITS[value] ?? Number.NaN;
  return (tens ? CHINESE_DIGITS[tens] ?? 0 : 1) * 10 +
    (units ? CHINESE_DIGITS[units] ?? 0 : 0);
}

function normalizeCatalogText(value: string) {
  return value
    .normalize("NFKC")
    .replace(
      /([零一二兩两三四五六七八九十]+)\s*(?:至|到|[-–—])\s*([零一二兩两三四五六七八九十]+)/g,
      (_, from: string, until: string) =>
        `${chineseInteger(from)}-${chineseInteger(until)}`,
    )
    .replace(/[–—至到]/g, "-")
    .toLowerCase();
}

function peopleRange(value: string) {
  const match = normalizeCatalogText(value).match(
    /(\d{1,3})\s*-\s*(\d{1,3})\s*(?:人|位)?/,
  );
  return match ? [Number(match[1]), Number(match[2])] as const : null;
}

export function isCustomerServiceCatalogRequest(value: string) {
  const text = normalizeCatalogText(value);
  const seasonal = /中秋|聖誕|圣诞|新年|農曆年|农历年|端午|母親節|母亲节|父親節|父亲节/.test(
    text,
  );
  const detail = /套餐|餐牌|菜單|菜单|菜式|圖片|图片|相片|照片|產品|产品/.test(
    text,
  );
  return (seasonal && Boolean(peopleRange(text) || detail)) ||
    (detail && /參考|参考|想睇|想看|查看|詳情|详情|介紹|介绍/.test(text));
}

export function customerServiceCatalogQuery(
  text: string,
  recentMessages: CustomerServiceRecentMessage[] = [],
) {
  if (isCustomerServiceCatalogRequest(text)) return text.trim();
  if (!/參考|参考|詳情|详情|菜式|圖片|图片|相片|照片|未有訂單|未有订单/.test(text)) {
    return "";
  }
  const recentCustomerText = recentMessages
    .filter((message) => message.role === "customer")
    .slice(-3)
    .map((message) => message.text);
  const contextualQuery = [...recentCustomerText, text.trim()]
    .filter(Boolean)
    .join(" ");
  return isCustomerServiceCatalogRequest(contextualQuery)
    ? contextualQuery
    : "";
}

const CATALOG_TERMS = [
  "中秋",
  "團圓",
  "团圆",
  "賞月",
  "赏月",
  "百味",
  "豪華",
  "豪华",
  "中菜",
  "聖誕",
  "圣诞",
  "新年",
  "端午",
] as const;

const CATALOG_SEARCH_ANCHORS = [
  "中秋",
  "團圓",
  "团圆",
  "賞月",
  "赏月",
  "聖誕",
  "圣诞",
  "新年",
  "端午",
  "套餐",
] as const;

export function customerServiceCatalogSearchAnchor(value: string) {
  const text = normalizeCatalogText(value);
  return CATALOG_SEARCH_ANCHORS.find((anchor) => text.includes(anchor)) ?? "";
}

export function rankCustomerServiceCatalog(
  query: string,
  candidates: CustomerServiceCatalogCandidate[],
  currentYear = new Date().getFullYear(),
) {
  const normalizedQuery = normalizeCatalogText(query);
  const requestedRange = peopleRange(normalizedQuery);
  const requestedYear = normalizedQuery.match(/\b(20\d{2})\b/)?.[1];

  return candidates
    .map((candidate) => {
      const name = normalizeCatalogText(candidate.name);
      const candidateRange = peopleRange(name);
      const candidateYear = name.match(/\b(20\d{2})\b/)?.[1];
      let score = 0;
      if (candidate.sku && normalizedQuery.includes(candidate.sku.toLowerCase())) {
        score += 150;
      }
      if (normalizedQuery.replace(/\s/g, "").includes(name.replace(/\s/g, ""))) {
        score += 80;
      }
      for (const term of CATALOG_TERMS) {
        if (normalizedQuery.includes(term) && name.includes(term)) score += 12;
      }
      if (requestedRange && candidateRange) {
        if (
          requestedRange[0] === candidateRange[0] &&
          requestedRange[1] === candidateRange[1]
        ) {
          score += 100;
        } else if (
          requestedRange[0] <= candidateRange[1] &&
          requestedRange[1] >= candidateRange[0]
        ) {
          score += 15;
        }
      }
      if (requestedYear && candidateYear === requestedYear) score += 30;
      if (!requestedYear && candidateYear === String(currentYear)) score += 20;
      if (/catering/i.test(candidate.channelName ?? "")) score += 3;
      return { candidate, score };
    })
    .filter(({ score }) => score >= 12)
    .sort((left, right) => right.score - left.score)
    .map(({ candidate }) => candidate);
}

function normalizedChannelName(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function mappedCustomerServiceCatalogAssets(
  packageId: string,
  channelName: string | null,
  mappings: CustomerServiceCatalogShopifyMapping[],
  drafts: CustomerServiceCatalogShopifyDraft[],
) {
  const packageMappings = mappings.filter(
    (mapping) => mapping.internalPackageId === packageId,
  );
  const normalizedChannel = normalizedChannelName(channelName);
  const mapping = packageMappings.find(
    (item) =>
      normalizedChannel &&
      normalizedChannelName(item.channelName) === normalizedChannel,
  ) ?? (packageMappings.length === 1 ? packageMappings[0] : undefined);
  if (!mapping) return { imageUrl: null, productUrl: null };

  const draft = drafts.find(
    (item) =>
      item.storeId === mapping.storeId &&
      item.shopifyProductId === mapping.shopifyProductId,
  );
  const shopDomain = mapping.shopDomain.trim();
  const handle = draft?.handle.trim() ?? "";
  if (!draft || !shopDomain || !handle) {
    return { imageUrl: null, productUrl: null };
  }

  const publicDomain = shopDomain === "foodchannels-catering.myshopify.com"
    ? "foodchannels-catering.com"
    : shopDomain;
  return {
    imageUrl: draft.imageUrl?.trim() || null,
    productUrl: `https://${publicDomain}/products/${encodeURIComponent(handle)}`,
  };
}

export function customerServiceCatalogReply(hit: CustomerServiceCatalogHit) {
  const lines = ["你講嘅應該係：", hit.name];
  if (typeof hit.price === "number") {
    lines.push(`參考價：HK$${hit.price.toLocaleString("en-HK")}`);
  }
  if (hit.items.length) {
    lines.push("部分菜式／選擇包括：");
    lines.push(...hit.items.slice(0, 8).map((item) => `• ${item}`));
    if (hit.items.length > 8) {
      lines.push(`• 另有 ${hit.items.length - 8} 款選擇`);
    }
  }
  if (hit.productUrl) lines.push(`套餐詳情：${hit.productUrl}`);
  return lines.join("\n");
}
