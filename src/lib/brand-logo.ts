export const FOOD_CHANNEL_CATERING_LOGO_PATH = "/assets/fc-catering-logo.svg";
export const FOOD_CHANNEL_EXPRESS_LOGO_PATH = "/assets/fc-express-logo.png";
export const FOOD_CHANNEL_DELIVERY_LOGO_PATH = "/assets/fc-delivery-logo.png";
export const HK_LUNCH_BOX_LOGO_PATH = "/assets/fcc-hk-lunch-box-logo.svg";
export const HK_PARTY_FOOD_LOGO_PATH = "/assets/fcc-hk-party-food-logo.svg";
export const FOOD_CHANNEL_KITCHEN_LOGO_PATH = "/assets/fck-logo.svg";
export const FC_CUISINE_LOGO_PATH = "/assets/fc-cuisine-logo.svg";

const LUNCH_BOX_PATTERN = /(?:lunch\s*box|lunchbox|hklunchbox|飯盒|\bfcbq\d*)/i;
const PARTY_FOOD_PATTERN = /(?:party\s*food|partyfood|hkpartyfood|\bfcpq\d*)/i;
const KITCHEN_PATTERN = /(?:food\s*channel(?:s)?\s*kitchen|\bfck\b|中央廚房|kitchen|\bfckq\d*)/i;
const CUISINE_PATTERN = /(?:福滿樓|fc\s*cuisine|cuisine)/i;
const EXPRESS_PATTERN = /(?:\bexpress\b|foodchannels-express)/i;
const DELIVERY_PATTERN = /(?:\bdelivery\b|foodchannels-delivery)/i;
const CATERING_PATTERN = /(?:\bcatering\b|foodchannels-catering)/i;

/** Logo for a storefront menu card. Unknown brands return null so they are not shown with another brand's mark. */
export function getStorefrontLogoPath(
  ...values: Array<string | null | undefined>
): string | null {
  const brandText = values.filter(Boolean).join(" ");
  if (LUNCH_BOX_PATTERN.test(brandText)) return HK_LUNCH_BOX_LOGO_PATH;
  if (PARTY_FOOD_PATTERN.test(brandText)) return HK_PARTY_FOOD_LOGO_PATH;
  if (CUISINE_PATTERN.test(brandText)) return FC_CUISINE_LOGO_PATH;
  if (KITCHEN_PATTERN.test(brandText)) return FOOD_CHANNEL_KITCHEN_LOGO_PATH;
  if (EXPRESS_PATTERN.test(brandText)) return FOOD_CHANNEL_EXPRESS_LOGO_PATH;
  if (DELIVERY_PATTERN.test(brandText)) return FOOD_CHANNEL_DELIVERY_LOGO_PATH;
  if (CATERING_PATTERN.test(brandText)) return FOOD_CHANNEL_CATERING_LOGO_PATH;
  return null;
}

type BrandKind = "catering" | "lunch-box" | "party-food" | "kitchen" | "cuisine";

export function getBrandKind(
  ...values: Array<string | null | undefined>
): BrandKind {
  const brandText = values.filter(Boolean).join(" ");
  if (LUNCH_BOX_PATTERN.test(brandText)) return "lunch-box";
  if (PARTY_FOOD_PATTERN.test(brandText)) return "party-food";
  if (CUISINE_PATTERN.test(brandText)) return "cuisine";
  if (KITCHEN_PATTERN.test(brandText)) return "kitchen";
  return "catering";
}

export function getDocumentLogoPath(
  ...brandValues: Array<string | null | undefined>
): string {
  switch (getBrandKind(...brandValues)) {
    case "lunch-box":
      return HK_LUNCH_BOX_LOGO_PATH;
    case "party-food":
      return HK_PARTY_FOOD_LOGO_PATH;
    case "kitchen":
      return FOOD_CHANNEL_KITCHEN_LOGO_PATH;
    case "cuisine":
      return FC_CUISINE_LOGO_PATH;
    default:
      return FOOD_CHANNEL_CATERING_LOGO_PATH;
  }
}

export function getBrandLogoAlt(
  ...brandValues: Array<string | null | undefined>
): string {
  switch (getBrandKind(...brandValues)) {
    case "lunch-box":
      return "HK Lunch Box";
    case "party-food":
      return "HK Party Food";
    case "kitchen":
      return "Food Channel Kitchen";
    case "cuisine":
      return "FC Cuisine 福滿樓";
    default:
      return "Food Channel Catering";
  }
}

export function getBrandDisplayName(
  ...brandValues: Array<string | null | undefined>
): string {
  switch (getBrandKind(...brandValues)) {
    case "lunch-box":
      return "HK Lunch Box";
    case "party-food":
      return "HK Party Food";
    case "kitchen":
      return "Food Channel Kitchen";
    case "cuisine":
      return "FC Cuisine 福滔樽";
    default:
      return "Food Channels Catering";
  }
}

export function getBrandContactEmail(
  configuredEmail: string | null | undefined,
  ...brandValues: Array<string | null | undefined>
): string {
  const email = configuredEmail?.trim();
  if (email) return email;

  switch (getBrandKind(...brandValues)) {
    case "lunch-box":
      return "sales@hklunchbox.com";
    case "party-food":
      return "sales@hkpartyfood.com";
    case "kitchen":
      return "sales@foodchannels-kitchen.com";
    case "cuisine":
      return "sales@foodchannels-cuisine.com";
    default:
      return "sales@foodchannels-catering.com";
  }
}
