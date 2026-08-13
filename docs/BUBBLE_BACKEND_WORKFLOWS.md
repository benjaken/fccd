# Bubble Backend Workflows Inventory

> Evidence captured from Bubble Editor screenshots. This document records
> existing behavior for migration; unsafe behavior is not automatically an
> implementation requirement.

## Progress

- Workflow details captured: **1**
- Current workflow: `add_print_label`
- Full Backend Workflow inventory count: pending

## add_print_label

### Endpoint

- Event: `add_print_label is called`
- Endpoint name: `add_print_label`
- Exposed as public API workflow: enabled
- Authentication: `User & admin`
- Trigger method: `POST`
- Parameter definition: manual
- Response type: JSON Object
- Ignore Privacy Rules when running: enabled

Parameters shown:

| Parameter | Bubble type | Required |
|---|---|---|
| `s_order` | S_Order | yes |
| `Label` | A_Label | yes |
| `Print_num` | number | yes |
| `RemarkA` | text | yes |
| `RemarkB` | text | yes |
| `Quantity` | number | yes |
| `order` | number | yes |
| `A_order` | A_Order | yes |
| `Number of item` | number | yes |

No endpoint-level `Only when` condition was shown.

### Step 1 — Create a new Print_Label

Creates one `Print_Label` with:

| Print_Label field | Value |
|---|---|
| `S_order` | endpoint `s_order` |
| `Label` | endpoint `Label` |
| `Order` | endpoint `A_order` |
| `Print_Order` | endpoint `order` |
| `Printed` | `no` |
| `Remark_A` | endpoint `RemarkA` |
| `Remark_B` | endpoint `RemarkB` |
| `Print_Quantity` | endpoint `Quantity` |
| `Number of item` | endpoint `Number of item` |

- Step-level `Only when`: none shown
- Disable action: off

### Step 2 — Schedule API Workflow add_print_label

- Scheduled date: `Current date/time`
- Ignore Privacy Rules when running: enabled
- Disable action: off
- Only when: `Print_num > 1`

Recursive parameter mapping:

| Parameter | Scheduled value |
|---|---|
| `s_order` | current `s_order` |
| `Label` | current `Label` |
| `Print_num` | current `Print_num - 1` |
| `RemarkA` | current `s_order's remarks1` |
| `RemarkB` | current `s_order's remarks2` |
| `Quantity` | current `Quantity` |
| `order` | current `order` |
| `A_order` | current `A_order` |
| `Number of item` | current `Number of item + 1` |

### Reconstructed Behavior

The endpoint creates one print-label record immediately. When `Print_num > 1`,
it schedules itself at the current time with a decremented count and incremented
item number. For a positive initial `Print_num = N`, it normally creates `N`
records.

Observed edge cases:

- `Print_num <= 0` still creates one record because Step 1 has no guard.
- A large `Print_num` creates a long immediate recursive workflow chain.
- Retries or repeated calls can create duplicate labels; no idempotency key or
  uniqueness guard was shown.
- The first label uses endpoint `RemarkA`/`RemarkB`; recursive labels switch to
  `s_order.remarks1`/`s_order.remarks2`. Product-owner confirmation is required
  on whether this difference is intentional.
- Both the endpoint and recursive schedule bypass Privacy Rules.
- No role, order ownership, document-status, count limit, or parameter
  validation was shown.
- No explicit response action was shown despite JSON Object response type.

### Proposed Supabase Equivalent

Do not reproduce the immediate recursive workflow.

Use one authenticated server-side operation:

1. Verify the caller and require an authorized operations/printing role.
2. Verify access to the parent `A_Order`/`S_Order`.
3. Validate `Print_num` against a positive, configured upper bound.
4. Validate quantity and required references.
5. Insert the requested labels in one PostgreSQL transaction using a set-based
   operation such as `generate_series(0, Print_num - 1)`.
6. Increment `Number of item` deterministically for each generated row.
7. Use a request/batch idempotency key and a unique constraint to prevent
   duplicate labels on retries.
8. Store caller, source order, request ID, timestamps, and generated count in an
   audit record.
9. Return the created IDs/count and a structured error on failure.

Use a durable queue only if label rendering/printing is asynchronous; database
row creation itself should remain atomic rather than recursively scheduled.

## Outstanding Evidence

- All callers of `add_print_label` in pages, reusable elements, and workflows.
  Product owner confirmed on 2026-08-12 that caller evidence will be supplied
  when each page is developed.
- Whether `RemarkA`/`RemarkB` changing after the first label is intentional.
- Expected behavior for zero, negative, fractional, or very large `Print_num`.
- Existing duplicate-prevention or cancellation behavior outside the captured
  steps.
- Complete response payload.
- Remaining Backend Workflows and their folders/triggers.
