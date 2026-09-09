import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Isolated PostgreSQL runtime: no credentials or production data are used.
const db = new PGlite();
try {
  for (const file of [
    'test/sql/inventory-fixture.sql', 'test/sql/inventory-legacy-seed.sql',
    'supabase/migrations/20260908210000_unified_delivery_material_commitments.sql',
    'supabase/migrations/20260908220000_unified_inventory_demand.sql',
    'supabase/migrations/20260909143000_normalize_catering_material_units.sql',
    'supabase/migrations/20260909152000_packaging_item_unit_repairs.sql',
    'supabase/migrations/20260909160000_correct_corn_flakes_supplier_packaging.sql',
    'supabase/migrations/20260909170000_add_standard_utensil_pack_to_stocktake.sql',
    'supabase/migrations/20260909180000_link_order_utensil_material_demand.sql',
    'supabase/migrations/20260909190000_deduct_six_utensil_settings_per_pack.sql',
    'test/sql/inventory-rpc-fixture.sql',
    'supabase/migrations/20260817063000_cancel_pending_delivery.sql',
    'supabase/migrations/20260908224000_lock_existing_material_rpcs.sql',
    'test/sql/inventory-behaviour.sql',
    'test/sql/inventory-review-regressions.sql',
    'test/sql/inventory-bom-review.sql', 'test/sql/inventory-fourth-review.sql', 'test/sql/inventory-rpc-behaviour.sql', 'test/sql/inventory-lifecycle-regressions.sql', 'test/sql/inventory-legacy-behaviour.sql',
    'test/sql/inventory-unit-data-repair.sql',
    'test/sql/inventory-utensil-pack.sql',
    'test/sql/inventory-utensil-legacy-seed.sql',
    'supabase/migrations/20260909191000_reconcile_legacy_utensil_consumptions.sql',
    'test/sql/inventory-utensil-demand.sql',
    'test/sql/inventory-countable-pack-seed.sql',
    'supabase/migrations/20260909200000_countable_pack_child_unit_repair.sql',
    'supabase/migrations/20260909210000_countable_unit_audit_repair.sql',
    'test/sql/inventory-countable-toast-seed.sql',
    'supabase/migrations/20260909220000_countable_toast_loaf_repair.sql',
    'supabase/migrations/20260909230000_restore_pack_box_units_and_delivery_time.sql',
    'supabase/migrations/20260909240000_hide_reversed_pack_consumptions.sql',
    'test/sql/inventory-countable-pack-units.sql',
  ]) {
    const sql = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8'))
      .replace(/^\\set .*$/gm, '');
    // Send each statement separately, as psql does, so deferred triggers run
    // at autocommit boundaries while explicit BEGIN/COMMIT blocks stay intact.
    const tokens = sql.match(/--[^\n]*|\/\*[\s\S]*?\*\/|\$([A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$\1\$|'(?:''|[^'])*'|"(?:""|[^"])*"|;|[^;'"$/-]+|./g) ?? [];
    let statement = '';
    for (const token of tokens) {
      statement += token;
      if (token === ';') {
        await db.exec(statement);
        statement = '';
      }
    }
    if (statement.trim()) await db.exec(statement);
    console.log(`PASS ${file}`);
  }
} catch (error) {
  console.error(error.message, error.where ?? '');
  process.exitCode = 1;
} finally {
  await db.close();
}
