export const MIGRATION_ISSUE_GROUPS = [
  {
    key: "bomOrderLine",
    severity: "accepted",
    phase: "D1",
    source: "b_product_ingredients.S_order",
    target: "order_bom_requirements.order_line_id",
    issues: 1,
    affectedRows: 5,
    status: "accepted_nullable",
  },
  {
    key: "meatRawStock",
    severity: "accepted",
    phase: "D2",
    source: "m_donemeat_stock.from_rawStock_list",
    target: "prepared_meat_raw_allocations.raw_stock_event_id",
    issues: 17,
    affectedRows: 18,
    status: "accepted_nullable",
  },
  {
    key: "customerTag",
    severity: "accepted",
    phase: "S3",
    source: "s_customer_tag.Email",
    target: "customer_tag_assignments.customer_id",
    issues: 1,
    affectedRows: 1,
    status: "accepted_nullable",
  },
] as const;

export const MIGRATION_RECONCILIATION_WARNINGS = [
  {
    key: "grandTotal",
    severity: "warning",
    value: "HKD 1,556.00",
    status: "incremental_pending",
  },
  {
    key: "shippingFee",
    severity: "warning",
    value: "HKD 50.00",
    status: "incremental_pending",
  },
  {
    key: "restaurantSales",
    severity: "warning",
    value: "12",
    status: "incremental_pending",
  },
  {
    key: "fileDiscovery",
    severity: "blocking",
    value: "2,289+",
    status: "final_phase_pending",
  },
] as const;
