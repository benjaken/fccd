export type ShopifyImage = { src?: string | null };

export type ShopifyVariant = {
  id: number;
  product_id?: number;
  title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  image_id?: number | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};

export type ShopifyProduct = {
  id: number;
  title?: string | null;
  handle?: string | null;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  status?: string | null;
  tags?: string | string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  image?: ShopifyImage | null;
  variants?: ShopifyVariant[];
};

export type ShopifyBundleComponent = {
  key: string;
  parentVariantId?: number | null;
  productId?: number | null;
  variantId?: number | null;
  sku?: string | null;
  name: string;
  quantity: number;
};

export type ShopifyCatalogEnrichment = {
  fixedComponents?: ShopifyBundleComponent[];
  packageSchema?: unknown;
  variantRequiresComponents?: Record<string, boolean>;
};

export type NormalizedVariant = {
  shopifyVariantId: number;
  title: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  compareAtPrice: number | null;
  optionValues: Record<string, string>;
  imageUrl: string | null;
  requiresComponents: boolean;
};

export type NormalizedChoiceSet = {
  externalKey: string;
  name: string;
  minimumChoices: number | null;
  maximumChoices: number;
  sortOrder: number;
};

export type NormalizedPackageItem = {
  externalKey: string;
  choiceSetKey: string | null;
  parentVariantId: number | null;
  childProductId: number | null;
  childVariantId: number | null;
  sku: string | null;
  name: string;
  quantity: number;
  addonPrice: number;
  isRequired: boolean;
  isDefault: boolean;
};

export type NormalizedCatalogProduct = {
  shopifyProductId: number;
  title: string;
  handle: string | null;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  catalogType: "product" | "fixed_package" | "configurable_package" | "unknown";
  shopifyStatus: string | null;
  tags: string[];
  featuredImageUrl: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  variants: NormalizedVariant[];
  choiceSets: NormalizedChoiceSet[];
  packageItems: NormalizedPackageItem[];
};

export type ConfigurableSchema = {
  version?: number;
  type?: string;
  groups?: Array<{
    code?: string;
    name?: string;
    min?: number;
    max?: number;
    items?: Array<{
      key?: string;
      product_id?: number | string;
      variant_id?: number | string;
      sku?: string;
      name?: string;
      quantity?: number;
      addon_price?: number;
      default?: boolean;
    }>;
  }>;
};

type GloboOptionValue = {
  id?: number | string;
  name?: number | string;
  value?: string;
  "value_zh-TW"?: string;
  variant_id?: number | string;
  variant_price?: number | string;
  /** Direct add-on amount when Globo does not link a variant. */
  price?: number | string;
  addon?: number | string;
  addon_price?: number | string;
  selected?: boolean;
};

/** Prefer an explicit Globo add-on amount, then a surcharge written into the
 * option label such as "中秋三味乳鴿皇 ... [ $40.00 ]". */
export function globoOptionAddonPrice(value: GloboOptionValue): number {
  const labeled = nullableText(value["value_zh-TW"]) ?? nullableText(value.value) ?? "";
  const fromLabel = labeled.match(/\[\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\]\s*$/)?.[1];
  return nullableNumber(value.variant_price) ??
    nullableNumber(value.price) ??
    nullableNumber(value.addon_price) ??
    nullableNumber(value.addon) ??
    (fromLabel ? Number(fromLabel.replace(/,/g, "")) : null) ??
    0;
}

type GloboOptionElement = {
  id?: string;
  type?: string;
  label?: string;
  label_on_cart?: string;
  min?: number | string;
  max?: number | string;
  required?: boolean;
  option_values?: GloboOptionValue[];
  elements?: GloboOptionElement[];
};

type GloboOptionSet = {
  elements?: GloboOptionElement[];
  products?: {
    rule?: {
      manual?: { enable?: boolean; ids?: Array<number | string> };
    };
  };
};

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericId(value: unknown): number | null {
  if (typeof value === "string") {
    const match = value.match(/(\d+)$/);
    if (match) return Number(match[1]);
  }
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseTags(tags: ShopifyProduct["tags"]): string[] {
  const values = Array.isArray(tags) ? tags : String(tags ?? "").split(",");
  return [...new Set(values.map((tag) => tag.trim()).filter(Boolean))];
}

export function parsePackageSchema(value: unknown): ConfigurableSchema | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const schema = parsed as ConfigurableSchema;
  if (schema.type !== "configurable_package" || !Array.isArray(schema.groups)) {
    return null;
  }
  return schema;
}

export function normalizeShopDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return normalized.endsWith(".myshopify.com") ? normalized : null;
}

function globoJsonAssignments(html: string): Array<{ id: string; value: GloboOptionSet }> {
  const assignments: Array<{ id: string; value: GloboOptionSet }> = [];
  const marker = /window\.GPOConfigs\.options\[([^\]]+)\]\s*=\s*/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(html))) {
    const start = marker.lastIndex;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < html.length; index += 1) {
      const character = html[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        end = index + 1;
        break;
      }
    }
    if (end < 0) continue;
    try {
      assignments.push({ id: match[1], value: JSON.parse(html.slice(start, end)) as GloboOptionSet });
    } catch {
      // Ignore a malformed third-party assignment and continue with other sets.
    }
    marker.lastIndex = end;
  }
  return assignments;
}

function nestedGloboElements(elements: GloboOptionElement[]): GloboOptionElement[] {
  return elements.flatMap((element) => [element, ...nestedGloboElements(element.elements ?? [])]);
}

export function parseGloboPackageSchema(html: string, productId: number): ConfigurableSchema | null {
  const applicableAssignments = globoJsonAssignments(html)
    .filter((assignment) => {
      const manualRule = assignment.value.products?.rule?.manual;
      return manualRule?.enable === true
        && (manualRule.ids ?? []).some((id) => numericId(id) === productId);
    })
    .sort((left, right) => (numericId(right.id) ?? 0) - (numericId(left.id) ?? 0));
  for (const assignment of applicableAssignments) {
    const groups: NonNullable<ConfigurableSchema["groups"]> = [];
    for (const [elementIndex, element] of nestedGloboElements(assignment.value.elements ?? []).entries()) {
      const values = Array.isArray(element.option_values) ? element.option_values : [];
      if (!values.length) continue;
      const code = `${assignment.id}:${nullableText(element.id) ?? `group-${elementIndex + 1}`}`;
      groups.push({
        code,
        name: nullableText(element.label) ?? nullableText(element.label_on_cart) ?? code,
        min: nullableNumber(element.min) ?? (element.required ? 1 : 0),
        max: positiveNumber(element.max, Math.max(1, values.length)),
        items: values.map((value, valueIndex) => {
          const rawName = nullableText(value["value_zh-TW"]) ??
            nullableText(value.value) ??
            `Item ${valueIndex + 1}`;
          return {
            key: `${code}:${String(value.name ?? value.id ?? valueIndex + 1)}`,
            variant_id: numericId(value.variant_id) ?? undefined,
            name: rawName.replace(/\s*\[\s*\$?\s*[\d,]+(?:\.\d+)?\s*\]\s*$/, "").trim() || rawName,
            quantity: 1,
            addon_price: globoOptionAddonPrice(value),
            default: value.selected === true,
          };
        })
      });
    }
    // Globo may leave an older option set assigned to the same product. The
    // highest numeric set id is the latest definition and must win as a unit.
    if (groups.length) return { version: 1, type: "configurable_package", groups };
  }
  return null;
}

export function isShopifyOptionHelperProduct(product: ShopifyProduct): boolean {
  const tags = parseTags(product.tags).map((tag) => tag.toLowerCase());
  const handle = nullableText(product.handle)?.toLowerCase() ?? "";
  const title = nullableText(product.title)?.normalize("NFKC") ?? "";
  const isSelectionGroup = /\d+\s*選\s*\d+[)）]?\s*$/.test(title);
  return tags.includes("globo-product-options") || handle.startsWith("option-set-") || isSelectionGroup;
}

export function resolveShopDomain(configured: unknown, stored: unknown): string | null {
  return normalizeShopDomain(configured) ?? normalizeShopDomain(stored);
}

export function normalizeCatalogProduct(
  product: ShopifyProduct,
  enrichment: ShopifyCatalogEnrichment = {},
): NormalizedCatalogProduct {
  const schema = parsePackageSchema(enrichment.packageSchema);
  const variants = (product.variants ?? []).map((variant) => ({
    shopifyVariantId: Number(variant.id),
    title: nullableText(variant.title),
    sku: nullableText(variant.sku),
    barcode: nullableText(variant.barcode),
    price: nullableNumber(variant.price),
    compareAtPrice: nullableNumber(variant.compare_at_price),
    optionValues: Object.fromEntries(
      [variant.option1, variant.option2, variant.option3]
        .map((option, index) => [String(index + 1), nullableText(option)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    ),
    imageUrl: null,
    requiresComponents: Boolean(enrichment.variantRequiresComponents?.[String(variant.id)]),
  }));

  const choiceSets: NormalizedChoiceSet[] = [];
  const packageItems: NormalizedPackageItem[] = [];
  if (schema) {
    schema.groups?.forEach((group, groupIndex) => {
      const groupKey = nullableText(group.code) ?? `group-${groupIndex + 1}`;
      const groupItems = Array.isArray(group.items) ? group.items : [];
      choiceSets.push({
        externalKey: groupKey,
        name: nullableText(group.name) ?? groupKey,
        minimumChoices: nullableNumber(group.min),
        maximumChoices: positiveNumber(group.max, Math.max(1, groupItems.length)),
        sortOrder: groupIndex,
      });
      groupItems.forEach((item, itemIndex) => {
        const variantId = numericId(item.variant_id);
        packageItems.push({
          externalKey: nullableText(item.key) ?? `${groupKey}-${variantId ?? itemIndex + 1}`,
          choiceSetKey: groupKey,
          parentVariantId: variants[0]?.shopifyVariantId ?? null,
          childProductId: numericId(item.product_id),
          childVariantId: variantId,
          sku: nullableText(item.sku),
          name: nullableText(item.name) ?? nullableText(item.sku) ?? `Item ${itemIndex + 1}`,
          quantity: positiveNumber(item.quantity, 1),
          addonPrice: nullableNumber(item.addon_price) ?? 0,
          isRequired: false,
          isDefault: item.default === true,
        });
      });
    });
  } else {
    (enrichment.fixedComponents ?? []).forEach((component, index) => {
      packageItems.push({
        externalKey: component.key || `component-${component.variantId ?? index + 1}`,
        choiceSetKey: null,
        parentVariantId: component.parentVariantId ?? null,
        childProductId: component.productId ?? null,
        childVariantId: component.variantId ?? null,
        sku: nullableText(component.sku),
        name: component.name,
        quantity: positiveNumber(component.quantity, 1),
        addonPrice: 0,
        isRequired: true,
        isDefault: true,
      });
    });
  }

  const hasFixedComponents = packageItems.length > 0 && !schema;
  return {
    shopifyProductId: Number(product.id),
    title: nullableText(product.title) ?? `Shopify product ${product.id}`,
    handle: nullableText(product.handle),
    descriptionHtml: nullableText(product.body_html),
    vendor: nullableText(product.vendor),
    productType: nullableText(product.product_type),
    catalogType: schema ? "configurable_package" : hasFixedComponents ? "fixed_package" : "product",
    shopifyStatus: nullableText(product.status),
    tags: parseTags(product.tags),
    featuredImageUrl: nullableText(product.image?.src),
    sourceCreatedAt: nullableText(product.created_at),
    sourceUpdatedAt: nullableText(product.updated_at),
    variants,
    choiceSets,
    packageItems,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function canonicalCatalogJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function catalogChangeDiff(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  if (!previous) return {};
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (canonicalCatalogJson(previous[key]) !== canonicalCatalogJson(next[key])) {
      diff[key] = { before: previous[key] ?? null, after: next[key] ?? null };
    }
  }
  return diff;
}
