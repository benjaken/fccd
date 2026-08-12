# 2026-08-12 Orphan Data Issues

## Status summary

```text
Accepted issues: 19
Affected Supabase rows: 24
Open issues: 0
Fake UUIDs created: 0
Disposition: retain legacy ID + nullable UUID
```

`accepted` means the migration was allowed to continue with a nullable UUID.
It does not mean the missing target record has been restored.

## 1. Missing S_Order target

```text
Source type: b_product_ingredients
Source field: S_order
Target type: s_order
Missing target legacy ID: 1768790210528x973222345052520400
Supabase UUID field: order_bom_requirements.order_line_id
Current UUID value: null
Affected rows: 5
```

Affected `b_product_ingredients` / `order_bom_requirements` legacy IDs:

| Source legacy ID | Missing S_Order legacy ID |
|---|---|
| `1768790218367x355339668132624200` | `1768790210528x973222345052520400` |
| `1768790222192x948381955748039600` | `1768790210528x973222345052520400` |
| `1768790225943x467218278810390900` | `1768790210528x973222345052520400` |
| `1768790229500x149758466011876260` | `1768790210528x973222345052520400` |
| `1768790233090x518878626889116540` | `1768790210528x973222345052520400` |

Missing content:

- The referenced Bubble `S_Order` row is absent from the fixed production
  snapshot.
- Product, order and ingredient UUIDs on the five BOM rows are valid.
- Only the order-line UUID is missing.

Repair options:

1. Restore or export the missing Bubble `S_Order`, import it into
   `order_lines`, then resolve all five `order_line_id` values.
2. Confirm that the line was historically deleted and keep the accepted
   nullable UUID.
3. If another order line is the correct target, record approved evidence before
   changing the UUID. Never infer a replacement from product name alone.

Verification after repair:

```sql
select count(*)
from order_bom_requirements
where order_line_legacy_id =
  '1768790210528x973222345052520400'
and order_line_id is null;
```

Expected result after restoration: `0`.

## 2. Missing Raw Stock targets

```text
Source type: m_donemeat_stock
Source field: from_rawStock_list
Target type: m_raw_stock
Supabase relationship: prepared_meat_raw_allocations.raw_stock_event_id
Missing target IDs: 17
Affected allocation rows: 18
Current UUID value: null
```

| Missing M_raw_stock legacy ID | Affected M_doneMeat_stock source legacy IDs | Rows |
|---|---|---:|
| `1760495041794x843961055944522500` | `1760495042012x903338547543619500` | 1 |
| `1761207068993x299835922539724040` | `1761207069381x451993609027931900` | 1 |
| `1762140673225x335824175698444600` | `1762140673512x700209291668040200` | 1 |
| `1762316316697x333478496966759230` | `1762316317439x220001800372931170` | 1 |
| `1763519558709x313036459720557250` | `1763519559197x778834787997462100` | 1 |
| `1763603980271x366935321000197100` | `1763603980566x370768525801351800` | 1 |
| `1764211318578x550296872006676540` | `1764211318889x952077389358706400` | 1 |
| `1765506877936x884692109779852200` | `1765506878237x213944717987004640` | 1 |
| `1770780469586x669586981342825200` | `1770780469911x367268448895930560` | 1 |
| `1770781048387x219748601344571520` | `1770781048900x367241239849621600`, `1770781049086x681794163721802800` | 2 |
| `1770781148938x486959397343009800` | `1770781149610x440814747179601100` | 1 |
| `1770862783960x347350827058489300` | `1770862784956x479137086272032600` | 1 |
| `1771829649785x749337540093054600` | `1771829650471x932079419528602200` | 1 |
| `1771830116687x804650562882071300` | `1771830116963x205887998683361500` | 1 |
| `1772076693645x214601654904527970` | `1772076694360x785726367783536000` | 1 |
| `1772507986521x389693486349450560` | `1772507986993x345786424233093250` | 1 |
| `1773201159309x688820513542001500` | `1773201159677x177694376517427700` | 1 |

Missing content:

- The 17 referenced Bubble `M_raw_stock` source events do not exist in the
  fixed production snapshot.
- Prepared-meat stock events were imported successfully.
- Allocation legacy IDs were retained, but no replacement UUID was generated.

Repair options:

1. Recover the missing raw-stock events from a Bubble backup or historical
   export and import them into `raw_meat_stock_events`.
2. Confirm that the source events were intentionally deleted and retain the
   accepted nullable allocations.
3. If business evidence proves that a different raw-stock event is correct,
   update the UUID only after recording an approval and audit note.

Do not create zero-quantity placeholder stock events. They would corrupt yield,
cost and inventory reconciliation.

## 3. Missing Customer target

```text
Source type: s_customer_tag
Source legacy ID: 1786351341644x648052049505157100
Source field: Email
Target type: customers
Target legacy ID: unavailable
Supabase UUID field: customer_tag_assignments.customer_id
Current UUID value: null
Affected rows: 1
```

Missing content:

- Production `A_Customers` contains zero rows.
- No customer UUID matched the preserved email snapshot.
- The email value is retained in the restricted Supabase row but is not
  reproduced in this report.

Repair options:

1. Create the customer through an approved Customer/Shopify source, then link
   the assignment by verified email.
2. Keep the assignment as a historical email-only tag.
3. Archive the assignment if the customer cannot be lawfully or reliably
   reconstructed.

Do not create a customer using email alone without deduplication and ownership
review.

## Issue update procedure

When a missing target is repaired:

1. Import or identify the valid target record.
2. Verify its `legacy_id` or other approved evidence.
3. Write the UUID foreign key.
4. Re-run orphan and count reconciliation.
5. Change the corresponding `data_quality_issues.status` from `accepted` to
   `resolved`.
6. Add resolution evidence and `resolved_at`.

No issue should be deleted from the audit history.
