import type {
  ShopifyDraftPackageItem,
  ShopifyDraftVariant,
  ShopifyPendingDetail,
} from "@/lib/shopify-product-approvals";

export type ShopifyComparisonStatus = "same" | "changed" | "new";

export type ShopifyComparisonRow = {
  id: string;
  section: string;
  field: "match" | "name" | "sku" | "price" | "description" | "image" | "active" | "quantity" | "addonPrice" | "selected";
  currentValue: string;
  shopifyValue: string;
  status: ShopifyComparisonStatus;
};

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "—";
}

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function row(input: Omit<ShopifyComparisonRow, "status"> & { currentExists: boolean }): ShopifyComparisonRow {
  const { currentExists, ...values } = input;
  return {
    ...values,
    status: !currentExists ? "new" : values.currentValue === values.shopifyValue ? "same" : "changed",
  };
}

function expectedProductName(detail: ShopifyPendingDetail, variant: ShopifyDraftVariant): string {
  return !variant.title || variant.title === "Default Title"
    ? detail.title
    : `${detail.title} / ${variant.title}`;
}

function variantRows(detail: ShopifyPendingDetail, variant: ShopifyDraftVariant): ShopifyComparisonRow[] {
  const current = variant.currentProduct;
  const section = variant.sku ?? variant.title ?? `#${variant.shopifyVariantId}`;
  const exists = Boolean(current);
  return [
    { id: `${variant.id}:match`, section, field: "match", currentValue: current ? `${current.sku ?? "—"} · ${current.name}` : "—", shopifyValue: variant.matchStatus, status: current ? "same" : "new" },
    row({ id: `${variant.id}:name`, section, field: "name", currentValue: text(current?.name), shopifyValue: text(expectedProductName(detail, variant)), currentExists: exists }),
    row({ id: `${variant.id}:sku`, section, field: "sku", currentValue: text(current?.sku), shopifyValue: text(variant.sku), currentExists: exists }),
    row({ id: `${variant.id}:price`, section, field: "price", currentValue: number(current?.price), shopifyValue: number(variant.price), currentExists: exists }),
    row({ id: `${variant.id}:description`, section, field: "description", currentValue: text(current?.description), shopifyValue: text(detail.descriptionHtml), currentExists: exists }),
    row({ id: `${variant.id}:image`, section, field: "image", currentValue: text(current?.imageUrl), shopifyValue: text(detail.featuredImageUrl), currentExists: exists }),
    row({ id: `${variant.id}:active`, section, field: "active", currentValue: current ? yesNo(current.isActive) : "—", shopifyValue: yesNo(detail.shopifyStatus === "active"), currentExists: exists }),
  ];
}

function packageItemRows(item: ShopifyDraftPackageItem): ShopifyComparisonRow[] {
  const currentLine = item.currentPackageItem;
  const currentProduct = item.currentProduct;
  const section = item.sku ?? item.name;
  const exists = Boolean(currentLine && currentProduct);
  return [
    { id: `${item.id}:match`, section, field: "match", currentValue: currentProduct ? `${currentProduct.sku ?? "—"} · ${currentProduct.name}` : "—", shopifyValue: `${item.sku ?? "—"} · ${item.name}`, status: exists ? "same" : "new" },
    row({ id: `${item.id}:quantity`, section, field: "quantity", currentValue: currentLine ? String(currentLine.quantity) : "—", shopifyValue: String(item.quantity), currentExists: exists }),
    row({ id: `${item.id}:addonPrice`, section, field: "addonPrice", currentValue: currentLine ? number(currentLine.addonPrice) : "—", shopifyValue: number(item.addonPrice), currentExists: exists }),
    row({ id: `${item.id}:selected`, section, field: "selected", currentValue: currentLine ? yesNo(currentLine.isSelected) : "—", shopifyValue: yesNo(item.required || item.isDefault), currentExists: exists }),
  ];
}

export function buildShopifyDatabaseComparison(detail: ShopifyPendingDetail): ShopifyComparisonRow[] {
  if (detail.catalogType === "product") return detail.variants.flatMap((variant) => variantRows(detail, variant));
  const firstVariant = detail.variants[0];
  const current = detail.currentPackage;
  const exists = Boolean(current);
  const packageRows: ShopifyComparisonRow[] = [
    row({ id: `${detail.id}:name`, section: detail.title, field: "name", currentValue: text(current?.name), shopifyValue: text(detail.title), currentExists: exists }),
    row({ id: `${detail.id}:sku`, section: detail.title, field: "sku", currentValue: text(current?.sku), shopifyValue: text(firstVariant?.sku), currentExists: exists }),
    row({ id: `${detail.id}:price`, section: detail.title, field: "price", currentValue: number(current?.price), shopifyValue: number(firstVariant?.price), currentExists: exists }),
    row({ id: `${detail.id}:description`, section: detail.title, field: "description", currentValue: text(current?.description), shopifyValue: text(detail.descriptionHtml), currentExists: exists }),
    row({ id: `${detail.id}:active`, section: detail.title, field: "active", currentValue: current ? yesNo(current.isActive) : "—", shopifyValue: yesNo(detail.shopifyStatus === "active"), currentExists: exists }),
  ];
  return [...packageRows, ...detail.fixedItems.flatMap(packageItemRows), ...detail.choiceSets.flatMap((choice) => choice.items.flatMap(packageItemRows))];
}
