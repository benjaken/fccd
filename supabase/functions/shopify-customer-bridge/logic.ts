export const SHOPIFY_API_VERSION = "2026-07";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SyncLocalAddress = {
  id: string;
  recipient: string;
  phone: string;
  address: string;
  isDefault: boolean;
  archived: boolean;
};

export type SyncRemoteAddress = {
  id: string;
  recipient: string;
  phone: string;
  address: string;
  isDefault: boolean;
};

export type SyncLink = {
  localId: string;
  remoteId: string;
  syncedHash: string;
  status: "synced" | "conflict";
};

export type SyncAction =
  | { type: "push_create"; localId: string }
  | { type: "push_update"; localId: string; remoteId: string }
  | { type: "push_delete"; localId: string; remoteId: string }
  | { type: "pull_create"; remoteId: string }
  | { type: "pull_update"; localId: string; remoteId: string }
  | { type: "pull_archive"; localId: string; remoteId: string }
  | { type: "conflict"; localId: string; remoteId: string }
  | { type: "hold"; localId: string; remoteId: string }
  | { type: "drop_link"; localId: string; remoteId: string };

export function shopifyCustomerGid(value: string): string | null {
  const text = value.trim();
  if (/^[0-9]+$/.test(text)) return `gid://shopify/Customer/${text}`;
  if (/^gid:\/\/shopify\/Customer\/[0-9]+$/.test(text)) return text;
  return null;
}

export function voucherCodeFromBytes(bytes: Uint8Array): string {
  let code = "FCCD";
  for (let index = 0; index < 10; index += 1) {
    code += CODE_ALPHABET[(bytes[index] ?? 0) % CODE_ALPHABET.length];
  }
  return code;
}

export function addressFingerprint(input: {
  recipient: string;
  phone: string;
  address: string;
  isDefault: boolean;
}): string {
  const recipient = input.recipient.trim().replace(/\s+/g, " ").toLowerCase();
  const phone = input.phone.trim().replace(/[^\d+]/g, "");
  const address = input.address.trim().replace(/\s+/g, " ").toLowerCase();
  return `${recipient}\u001f${phone}\u001f${address}\u001f${input.isDefault ? "1" : "0"}`;
}

export function planAddressReconciliation(input: {
  local: SyncLocalAddress[];
  remote: SyncRemoteAddress[];
  links: SyncLink[];
  trackDefault?: boolean;
}): SyncAction[] {
  const trackDefault = input.trackDefault !== false;
  const hashOf = (row: { recipient: string; phone: string; address: string; isDefault: boolean }) =>
    addressFingerprint({ ...row, isDefault: trackDefault ? row.isDefault : false });
  const localById = new Map(input.local.map(row => [row.id, row]));
  const remoteById = new Map(input.remote.map(row => [row.id, row]));
  const linkedLocal = new Set(input.links.map(link => link.localId));
  const linkedRemote = new Set(input.links.map(link => link.remoteId));
  const actions: SyncAction[] = [];

  for (const link of input.links) {
    if (link.status === "conflict") {
      actions.push({ type: "hold", localId: link.localId, remoteId: link.remoteId });
      continue;
    }
    const local = localById.get(link.localId);
    const remote = remoteById.get(link.remoteId);
    if (!local && remote) {
      actions.push({ type: "push_delete", localId: link.localId, remoteId: link.remoteId });
      continue;
    }
    if (!local && !remote) {
      actions.push({ type: "drop_link", localId: link.localId, remoteId: link.remoteId });
      continue;
    }
    if (!local || !remote) {
      if (local && !local.archived && hashOf(local) === link.syncedHash) {
        actions.push({ type: "pull_archive", localId: link.localId, remoteId: link.remoteId });
      } else if (local && !local.archived) {
        actions.push({ type: "conflict", localId: link.localId, remoteId: link.remoteId });
      }
      continue;
    }
    const localHash = hashOf(local);
    const remoteHash = hashOf(remote);
    const localChanged = localHash !== link.syncedHash || local.archived;
    const remoteChanged = remoteHash !== link.syncedHash;
    if (local.archived && !remoteChanged) {
      actions.push({ type: "push_delete", localId: local.id, remoteId: remote.id });
    } else if (local.archived && remoteChanged) {
      actions.push({ type: "conflict", localId: local.id, remoteId: remote.id });
    } else if (localChanged && remoteChanged) {
      actions.push({ type: "conflict", localId: local.id, remoteId: remote.id });
    } else if (localChanged) {
      actions.push({ type: "push_update", localId: local.id, remoteId: remote.id });
    } else if (remoteChanged) {
      actions.push({ type: "pull_update", localId: local.id, remoteId: remote.id });
    }
  }

  for (const local of input.local) {
    if (!local.archived && !linkedLocal.has(local.id)) actions.push({ type: "push_create", localId: local.id });
  }
  for (const remote of input.remote) {
    if (!linkedRemote.has(remote.id)) actions.push({ type: "pull_create", remoteId: remote.id });
  }
  return actions;
}

export function toMailingAddress(input: { recipient: string; phone: string; address: string }) {
  const recipient=input.recipient.trim();
  const phone=input.phone.trim();
  const address=input.address.trim().replace(/\s+/g," ");
  const split=address.length>255 ? address.lastIndexOf(" ",255) : -1;
  const address1=split>0 ? address.slice(0,split) : address;
  const address2=split>0 ? address.slice(split+1) : "";
  // Fail before changing Shopify if this shape cannot round-trip without data loss.
  if (recipient.length>100 || phone.length>40 || address1.length>255 || address2.length>255) throw new Error("address_requires_manual_sync");
  return {
    firstName: recipient,
    address1,
    ...(address2 ? { address2 } : {}),
    phone,
    city: "Hong Kong",
    countryCode: "HK",
  };
}

export function basicDiscountInput(input: {
  code: string;
  title: string;
  amount: number;
  startsAt: string;
  endsAt: string;
  customerGid?: string | null;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("invalid_voucher_amount");
  if (!/^FCCD[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(input.code)) throw new Error("invalid_voucher_code");
  return {
    title: input.title.slice(0, 120),
    code: input.code,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimit: 1,
    appliesOncePerCustomer: true,
    customerSelection: input.customerGid
      ? { customers: { add: [input.customerGid] } }
      : { all: true },
    customerGets: {
      value: { discountAmount: { amount: input.amount.toFixed(2), appliesOnEachItem: false } },
      items: { all: true },
    },
  };
}

export const DISCOUNT_CODE_CREATE = `mutation FccDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}`;

export const DISCOUNT_CODE_LOOKUP = `query FccDiscountCode($code: String!) {
  codeDiscountNodeByCode(code: $code) { id }
}`;

export const CUSTOMER_ADDRESSES = `query FccCustomerAddresses($id: ID!) {
  customer(id: $id) {
    id
    defaultAddress { id }
    addressesV2(first: 50) { nodes { id firstName lastName address1 address2 phone } }
  }
}`;

export const ADDRESS_CREATE = `mutation FccAddressCreate($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
  customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
    address { id }
    userErrors { field message }
  }
}`;

export const ADDRESS_UPDATE = `mutation FccAddressUpdate($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
  customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: $setAsDefault) {
    address { id }
    userErrors { field message }
  }
}`;

export const ADDRESS_DELETE = `mutation FccAddressDelete($customerId: ID!, $addressId: ID!) {
  customerAddressDelete(customerId: $customerId, addressId: $addressId) {
    deletedAddressId
    userErrors { field message }
  }
}`;

function userError(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors.map(error => {
    const row = error as { field?: string[] | null; message?: string };
    return row.message ?? "shopify_user_error";
  }).join("; ");
}

export function discountCreateId(data: unknown): { id: string } | { error: string } {
  const created = (data as { discountCodeBasicCreate?: { codeDiscountNode?: { id?: string }; userErrors?: unknown } } | null)
    ?.discountCodeBasicCreate;
  const error = userError(created?.userErrors);
  if (error) return { error };
  if (!created?.codeDiscountNode?.id) return { error: "shopify_discount_missing" };
  return { id: created.codeDiscountNode.id };
}

export function discountLookupId(data: unknown): string | null {
  const id = (data as { codeDiscountNodeByCode?: { id?: string } | null } | null)?.codeDiscountNodeByCode?.id;
  return id || null;
}

export function parseCustomerAddresses(data: unknown): SyncRemoteAddress[] {
  const customer = (data as {
    customer?: {
      defaultAddress?: { id?: string } | null;
      addressesV2?: { nodes?: Array<{ id?: string; firstName?: string | null; lastName?: string | null; address1?: string | null; address2?: string | null; phone?: string | null }> };
  } | null;
} | null)?.customer;
  if (!customer) return [];
  const defaultId = customer.defaultAddress?.id ?? "";
  return (customer.addressesV2?.nodes ?? []).flatMap(row => {
    if (!row.id) return [];
    const recipient = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
    const address = [row.address1, row.address2].filter(Boolean).join(" ").trim();
    return [{
      id: row.id,
      recipient,
      phone: row.phone ?? "",
      address,
      isDefault: row.id === defaultId,
    }];
  });
}

export function addressMutationId(data: unknown, field: "customerAddressCreate" | "customerAddressUpdate"): { id: string } | { error: string } {
  const payload = (data as Record<string, { address?: { id?: string }; userErrors?: unknown }> | null)?.[field];
  const error = userError(payload?.userErrors);
  if (error) return { error };
  if (!payload?.address?.id) return { error: "shopify_address_missing" };
  return { id: payload.address.id };
}

export function addressDeleteResult(data: unknown): { ok: true } | { error: string } {
  const payload = (data as { customerAddressDelete?: { deletedAddressId?: string | null; userErrors?: unknown } } | null)?.customerAddressDelete;
  const error = userError(payload?.userErrors);
  if (error) return { error };
  if (!payload?.deletedAddressId) return { error: "shopify_address_not_deleted" };
  return { ok: true };
}
