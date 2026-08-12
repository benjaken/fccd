export type MigrationPhaseStatus = "complete" | "reconciliation_required";
export type ReadinessStatus = "ready" | "partial" | "blocked";
export type MappingEvidence = "database_verified" | "inferred";

export type MigrationPhase = {
  key: "a" | "b" | "c" | "d1" | "d2" | "e" | "s1" | "s2" | "s3";
  imported: number;
  unresolvedUuidForeignKeys: number;
  status: MigrationPhaseStatus;
};

export type DomainReadiness = {
  key:
    | "lookup"
    | "commercial"
    | "catering"
    | "production"
    | "meatInventory"
    | "restaurant"
    | "authFiles";
  status: ReadinessStatus;
};

// Verified static aggregates from docs/SUPABASE_MAIN_MIGRATION_STATUS.md and
// docs/FULL_SCHEMA_APPROVAL_DRAFT.md. This module is display configuration,
// not live database state.
export const MIGRATION_STATUS = {
  source: {
    system: "Production Bubble Data API",
    baseUrl: "https://cs.foodchannels-catering.com/api/1.1/obj",
    target: "Supabase main (vignxasvlxqnyvuhtjlu)",
  },
  snapshotAt: "2026-08-12T02:39:34.000Z",
  policy: {
    businessTimeZone: "Asia/Hong_Kong",
    historicalCutoffLocal: "2021-08-12 00:00:00 +08:00",
    historicalCutoffUtc: "2021-08-11T16:00:00.000Z",
    historicalMode: "import_once",
    activeIncrementalFilter: "Modified Date > lastSuccessfulCheckpoint",
  },
  phases: [
    { key: "a", imported: 464, unresolvedUuidForeignKeys: 0, status: "complete" },
    { key: "b", imported: 12_241, unresolvedUuidForeignKeys: 0, status: "complete" },
    {
      key: "c",
      imported: 74_754,
      unresolvedUuidForeignKeys: 0,
      status: "reconciliation_required",
    },
    {
      key: "d1",
      imported: 81_972,
      unresolvedUuidForeignKeys: 0,
      status: "complete",
    },
    { key: "d2", imported: 38_059, unresolvedUuidForeignKeys: 0, status: "complete" },
    { key: "e", imported: 127_759, unresolvedUuidForeignKeys: 0, status: "complete" },
    { key: "s1", imported: 7_536, unresolvedUuidForeignKeys: 0, status: "complete" },
    { key: "s2", imported: 16_368, unresolvedUuidForeignKeys: 0, status: "complete" },
    { key: "s3", imported: 17_963, unresolvedUuidForeignKeys: 1, status: "complete" },
  ] satisfies MigrationPhase[],
  readiness: [
    { key: "lookup", status: "ready" },
    { key: "commercial", status: "ready" },
    { key: "catering", status: "partial" },
    { key: "production", status: "partial" },
    { key: "meatInventory", status: "blocked" },
    { key: "restaurant", status: "blocked" },
    { key: "authFiles", status: "blocked" },
  ] satisfies DomainReadiness[],
  fk: {
    migratedUnresolved: 0,
    databaseVerifiedReferenceRows: 950_149,
    currentOpenIssues: 19,
    currentAffectedRows: 24,
    knownFutureOrphanReferences: 0,
    mappings: [
      { source: "user_profiles.shop_restro_legacy_id", target: "user_profiles.shop_restro_id", resolved: 2, total: 2, evidence: "database_verified" },
      {
        source: "delivery_districts.driver_team_legacy_id",
        target: "delivery_districts.driver_team_id",
        resolved: 299,
        total: 299,
        evidence: "database_verified",
      },
      {
        source: "deliveries.motorcade_legacy_id",
        target: "deliveries.motorcade_id",
        resolved: 3_037,
        total: 3_037,
        evidence: "database_verified",
      },
      { source: "products.channel_legacy_id", target: "products.channel_id", resolved: 1_289, total: 1_289, evidence: "database_verified" },
      { source: "packages.channel_legacy_id", target: "packages.channel_id", resolved: 172, total: 172, evidence: "database_verified" },
      { source: "package_products.package_legacy_id", target: "package_products.package_id", resolved: 3_755, total: 3_755, evidence: "database_verified" },
      { source: "package_products.product_legacy_id", target: "package_products.product_id", resolved: 3_764, total: 3_764, evidence: "database_verified" },
      { source: "orders.customer_legacy_id", target: "orders.customer_id", resolved: 0, total: 0, evidence: "database_verified" },
      { source: "orders.channel_legacy_id", target: "orders.channel_id", resolved: 5_920, total: 5_920, evidence: "database_verified" },
      { source: "order_lines.order_legacy_id", target: "order_lines.order_id", resolved: 61_046, total: 61_046, evidence: "database_verified" },
      { source: "order_lines.product_legacy_id", target: "order_lines.product_id", resolved: 59_280, total: 59_280, evidence: "database_verified" },
      { source: "order_lines.package_legacy_id", target: "order_lines.package_id", resolved: 21_048, total: 21_048, evidence: "database_verified" },
      { source: "payments.order_legacy_id", target: "payments.order_id", resolved: 4_710, total: 4_710, evidence: "database_verified" },
      { source: "payments.channel_legacy_id", target: "payments.channel_id", resolved: 4_710, total: 4_710, evidence: "database_verified" },
      { source: "payments.payment_method_legacy_id", target: "payments.payment_method_id", resolved: 4_711, total: 4_711, evidence: "database_verified" },
      { source: "deliveries.order_legacy_id", target: "deliveries.order_id", resolved: 3_048, total: 3_048, evidence: "database_verified" },
      { source: "deliveries.district_legacy_id", target: "deliveries.district_id", resolved: 3_045, total: 3_045, evidence: "database_verified" },
    ],
  },
  gates: {
    schemaApprovalComplete: false,
    remainingDomainsComplete: true,
    incrementalReconciliationComplete: false,
    orphanDispositionComplete: false,
    authAndFilesComplete: false,
    durableBackendHandlersComplete: false,
  },
  blockers: [
    "schemaApproval",
    "incrementalReconciliation",
    "orphanDisposition",
    "authFiles",
    "backendHandlers",
  ],
} as const;

export const totalImported = MIGRATION_STATUS.phases.reduce(
  (sum, phase) => sum + phase.imported,
  0,
);

export const allReadinessGatesComplete =
  MIGRATION_STATUS.gates.schemaApprovalComplete &&
  MIGRATION_STATUS.gates.remainingDomainsComplete;

export const reconciliationGatesComplete =
  MIGRATION_STATUS.gates.incrementalReconciliationComplete &&
  MIGRATION_STATUS.gates.orphanDispositionComplete &&
  MIGRATION_STATUS.gates.authAndFilesComplete;
