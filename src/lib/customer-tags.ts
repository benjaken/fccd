import { supabase } from "@/lib/supabase";

export type CustomerTagType = {
  id: string;
  legacyId: string;
  name: string;
  isActive: boolean;
};

export type CustomerTag = {
  id: string;
  name: string;
  typeId: string | null;
  typeName: string;
  isActive: boolean;
};

type CustomerTagTypeRow = {
  id: string;
  legacy_id: string;
  name: string;
  is_active: boolean;
};

type CustomerTagRow = {
  id: string;
  name: string;
  customer_tag_type_id: string | null;
  customer_tag_type_legacy_id: string | null;
  is_active: boolean;
};

export type CustomerTagInput = {
  name: string;
  typeId: string;
  isActive: boolean;
};

function normalize(value: string) {
  return value.toLocaleLowerCase("zh-HK");
}

export function sortCustomerTags(rows: readonly CustomerTag[]) {
  return [...rows].sort(
    (left, right) =>
      left.typeName.localeCompare(right.typeName, "zh-Hant") ||
      left.name.localeCompare(right.name, "zh-Hant"),
  );
}

export function filterCustomerTags(
  rows: readonly CustomerTag[],
  search = "",
) {
  const term = normalize(search.trim());
  if (!term) return [...rows];
  return rows.filter(
    (row) =>
      normalize(row.name).includes(term) ||
      normalize(row.typeName).includes(term),
  );
}

export async function fetchCustomerTagTypes(): Promise<CustomerTagType[]> {
  const { data, error } = await supabase
    .from("customer_tag_types")
    .select("id,legacy_id,name,is_active")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as CustomerTagTypeRow[]).map((row) => ({
    id: row.id,
    legacyId: row.legacy_id,
    name: row.name,
    isActive: row.is_active,
  }));
}

export async function fetchCustomerTags(): Promise<CustomerTag[]> {
  const [tagsResult, types] = await Promise.all([
    supabase
      .from("customer_tags")
      .select(
        "id,name,customer_tag_type_id,customer_tag_type_legacy_id,is_active",
      ),
    fetchCustomerTagTypes(),
  ]);
  if (tagsResult.error) throw tagsResult.error;

  const typesById = new Map(types.map((type) => [type.id, type]));
  const typesByLegacyId = new Map(types.map((type) => [type.legacyId, type]));
  return sortCustomerTags(
    ((tagsResult.data ?? []) as CustomerTagRow[]).map((row) => {
      const type = row.customer_tag_type_id
        ? typesById.get(row.customer_tag_type_id)
        : row.customer_tag_type_legacy_id
          ? typesByLegacyId.get(row.customer_tag_type_legacy_id)
          : undefined;
      return {
        id: row.id,
        name: row.name,
        typeId: type?.id ?? row.customer_tag_type_id,
        typeName: type?.name ?? "",
        isActive: row.is_active,
      };
    }),
  );
}

export async function createCustomerTag(
  input: CustomerTagInput,
): Promise<CustomerTag> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  if (!input.typeId) throw new Error("type_required");

  const types = await fetchCustomerTagTypes();
  const type = types.find((item) => item.id === input.typeId);
  if (!type) throw new Error("type_required");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("customer_tags")
    .insert({
      legacy_id: `web-customer-tag-${crypto.randomUUID()}`,
      customer_tag_type_id: type.id,
      customer_tag_type_legacy_id: type.legacyId,
      name,
      is_active: input.isActive,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select("id,name,customer_tag_type_id,is_active")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    typeId: data.customer_tag_type_id,
    typeName: type.name,
    isActive: data.is_active,
  };
}

export async function updateCustomerTag(
  id: string,
  input: Partial<CustomerTagInput>,
): Promise<CustomerTag> {
  const types = await fetchCustomerTagTypes();
  const type = input.typeId
    ? types.find((item) => item.id === input.typeId)
    : undefined;
  const changes: Record<string, unknown> = {
    bubble_modified_at: new Date().toISOString(),
  };
  if (input.name !== undefined) changes.name = input.name.trim();
  if (input.isActive !== undefined) changes.is_active = input.isActive;
  if (input.typeId !== undefined) {
    if (!type) throw new Error("type_required");
    changes.customer_tag_type_id = type.id;
    changes.customer_tag_type_legacy_id = type.legacyId;
  }

  const { data, error } = await supabase
    .from("customer_tags")
    .update(changes)
    .eq("id", id)
    .select("id,name,customer_tag_type_id,is_active")
    .single();
  if (error) throw error;
  const savedType = types.find((item) => item.id === data.customer_tag_type_id);
  return {
    id: data.id,
    name: data.name,
    typeId: data.customer_tag_type_id,
    typeName: savedType?.name ?? "",
    isActive: data.is_active,
  };
}
