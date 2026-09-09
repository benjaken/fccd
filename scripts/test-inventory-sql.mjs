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
    'test/sql/inventory-rpc-fixture.sql',
    'supabase/migrations/20260817063000_cancel_pending_delivery.sql',
    'supabase/migrations/20260908224000_lock_existing_material_rpcs.sql',
    'test/sql/inventory-behaviour.sql',
    'test/sql/inventory-review-regressions.sql',
    'test/sql/inventory-bom-review.sql', 'test/sql/inventory-fourth-review.sql', 'test/sql/inventory-rpc-behaviour.sql', 'test/sql/inventory-lifecycle-regressions.sql', 'test/sql/inventory-legacy-behaviour.sql',
    'test/sql/inventory-unit-data-repair.sql',
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
