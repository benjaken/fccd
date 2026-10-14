const site = "https://foodchannels-catering.com";

export const PAYMENT_DELIVERY_URL = `${site}/pages/payment-delivery`;

export const PORTAL_GUIDE_LINKS = [
  { key: "about", href: `${site}/pages/about-us` },
  { key: "clients", href: `${site}/pages/customer-feedback-and-good-comment` },
  { key: "cases", href: `${site}/pages/using-a-lunch-meeting-to-boost-morale` },
  { key: "companyMeals", href: `${site}/pages/corporate-catering` },
  { key: "promise", href: `${site}/pages/about-us` },
] as const;
