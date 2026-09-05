const MEDIA_TYPES = new Set(["image", "voice", "audio"]);

const STRONG_AD_PATTERNS: Array<[string, RegExp]> = [
  ["finance", /(?:貸款|借錢|低息|免信貸報告|投資回報|炒股|虛擬貨幣|加密貨幣|博彩|賭場)/i],
  ["marketing", /(?:seo|代運營|代运营|流量推廣|流量推广|廣告投放|广告投放|網絡營銷|网络营销|引流獲客|引流获客)/i],
  ["recruitment", /(?:招聘兼職|招聘兼职|日薪|在家工作|刷單|刷单|高薪兼職|高薪兼职)/i],
  ["mass_message", /(?:群發|群发|加群|商務合作|商务合作|推廣合作|推广合作|代理加盟|批發代理|批发代理)/i],
];

const PROMOTION_PATTERN = /(?:優惠|优惠|限時|限时|免費試用|免费试用|折扣|特價|特价|推廣|推广|促銷|促销)/i;
const CONTACT_PATTERN = /(?:whatsapp|wechat|微信|telegram|tg[:：]|聯絡.{0,4}\d{6,}|联系.{0,4}\d{6,})/i;
const URL_PATTERN = /https?:\/\/|www\.|(?:bit\.ly|t\.me|wa\.me)\//gi;

export type AdvertisementAssessment = {
  isAdvertisement: boolean;
  score: number;
  reasons: string[];
};

export function isCustomerServiceMediaType(type: string) {
  return MEDIA_TYPES.has(type.trim().toLowerCase());
}

export function assessCustomerServiceAdvertisement(text: string): AdvertisementAssessment {
  const value = text.trim().slice(0, 2_000);
  if (!value || /^https?:\/\/\S+$/i.test(value)) {
    return { isAdvertisement: false, score: 0, reasons: [] };
  }

  const reasons = STRONG_AD_PATTERNS
    .filter(([, pattern]) => pattern.test(value))
    .map(([reason]) => reason);
  const urlCount = value.match(URL_PATTERN)?.length ?? 0;
  const promotion = PROMOTION_PATTERN.test(value);
  const contact = CONTACT_PATTERN.test(value);
  if (promotion) reasons.push("promotion");
  if (contact) reasons.push("external_contact");
  if (urlCount >= 1) reasons.push("external_url");

  const strongCount = reasons.filter((reason) =>
    ["finance", "marketing", "recruitment", "mass_message"].includes(reason)
  ).length;
  const score = Math.min(0.99,
    strongCount * 0.65 +
      (promotion ? 0.2 : 0) +
      (contact ? 0.15 : 0) +
      (urlCount ? 0.15 : 0),
  );
  return {
    isAdvertisement: score >= 0.8,
    score,
    reasons: [...new Set(reasons)],
  };
}
