// Optional real PostgreSQL test. Install embedded-postgres in a temporary
// directory and set FCCD_PG_TEST_RUNTIME to that directory (not production).
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

if (!process.env.FCCD_PG_TEST_RUNTIME) throw new Error('FCCD_PG_TEST_RUNTIME is required');
const require = createRequire(join(resolve(process.env.FCCD_PG_TEST_RUNTIME), 'package.json'));
const { Client } = require('pg');
const bin = join(resolve(process.env.FCCD_PG_TEST_RUNTIME), 'node_modules/@embedded-postgres/windows-x64/native/bin');
const prefix = join(tmpdir(), 'fccd-inventory-concurrency-');
const data = await mkdtemp(prefix);
const run = promisify(execFile);
const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
let postgres;
const clients = [];
try {
  await run(join(bin, 'initdb.exe'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'], { windowsHide: true });
  // pg_ctl starts Windows PostgreSQL with its restricted process token, so
  // this also works from an administrator terminal without creating an OS user.
  await new Promise((resolve, reject) => {
    const child = spawn(join(bin, 'pg_ctl.exe'), ['-D', data, '-l', join(data, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { windowsHide: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`pg_ctl start exited ${code}`)));
  });
  postgres = true;
  for (let index = 0; index < 3; index++) {
    const client = new Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres' });
    await client.connect();
    await client.query("set statement_timeout='8s'");
    clients.push(client);
  }
  const [a, b, observer] = clients;
  for (const file of ['test/sql/inventory-fixture.sql', 'test/sql/inventory-legacy-seed.sql',
    'supabase/migrations/20260908210000_unified_delivery_material_commitments.sql',
    'supabase/migrations/20260908220000_unified_inventory_demand.sql',
    'test/sql/inventory-rpc-fixture.sql',
    'supabase/migrations/20260817063000_cancel_pending_delivery.sql',
    'supabase/migrations/20260908224000_lock_existing_material_rpcs.sql',
    'test/sql/inventory-behaviour.sql', 'test/sql/inventory-bom-review.sql', 'test/sql/inventory-fourth-review.sql', 'test/sql/inventory-rpc-behaviour.sql', 'test/sql/inventory-lifecycle-regressions.sql', 'test/sql/inventory-legacy-behaviour.sql']) {
    const sql = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).replace(/^\\set .*$/gm, '');
    const tokens = sql.match(/--[^\n]*|\/\*[\s\S]*?\*\/|\$([A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$\1\$|'(?:''|[^'])*'|"(?:""|[^"])*"|;|[^;'"$/-]+|./g) ?? [];
    let statement = '';
    for (const token of tokens) { statement += token; if (token === ';') { await a.query(statement); statement = ''; } }
    if (statement.trim()) await a.query(statement);
  }
  const order = '30000000-0000-0000-0000-000000000002';
  const line = '40000000-0000-0000-0000-000000000002';
  const leg = '50000000-0000-0000-0000-000000000003';
  const allocations = JSON.stringify([{ delivery_id: leg, quantity: 15 }]);
  const lines = JSON.stringify([{ order_line_id: line, allocations: JSON.parse(allocations) }]);
  const gateDefinition=(await a.query("select pg_get_functiondef('private.lock_material_writes()'::regprocedure) as definition")).rows[0].definition;
  const disableGate=()=>a.query("create or replace function private.lock_material_writes() returns void language sql as 'select pg_sleep(0)'");
  const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  async function waitForAdvisory() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await observer.query("select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted", [pid]);
      if (result.rowCount) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('second connection did not wait on the advisory lock');
  }
  async function race(label, waitingSql, params, holdingSql, holdingParams) {
    await a.query('begin');
    await a.query('select private.lock_material_writes()');
    await a.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [order]);
    const waiting = b.query(waitingSql, params).then(() => null, (error) => error);
    try {
      await waitForAdvisory();
      await a.query(holdingSql ?? 'select set_order_delivery_allocations($1,$2::jsonb)', holdingParams ?? [order, lines]);
      await a.query('commit');
      const error = await waiting;
      if (error) throw error;
    } catch (error) { await a.query('rollback'); await waiting; throw error; }
    console.log(`PASS ${label}`);
  }
  if (process.argv.includes('--verify-old-lock')) {
    await disableGate();
    const definition = (await a.query("select pg_get_functiondef('public.set_order_line_delivery_allocations(uuid,jsonb)'::regprocedure) as definition")).rows[0].definition;
    const oldLock = definition.replace('where line.id = p_order_line_id;', 'where line.id = p_order_line_id for update;');
    assert.notEqual(oldLock, definition);
    await a.query(oldLock);
    try {
      await assert.rejects(race('old lock control', 'select set_order_line_delivery_allocations($1,$2::jsonb)', [line, allocations]), /deadlock detected/);
      console.log('PASS regression control reproduces old deadlock');
    } finally { await a.query(definition); await a.query(gateDefinition); }
  }
  await race('whole-order save versus single-line save', 'select set_order_line_delivery_allocations($1,$2::jsonb)', [line, allocations]);
  await race('whole-order save versus direct quantity edit', 'update order_lines set quantity=20 where id=$1', [line]);
  await a.query("update order_lines set product_id=null, package_id='80000000-0000-0000-0000-000000000001' where id=$1", [line]);
  await a.query("insert into order_package_choice_snapshots(order_id,order_line_id,package_product_id,is_selected) values ($1,$2,'90000000-0000-0000-0000-000000000001',false)", [order,line]);
  const choiceSql = 'update order_package_choice_snapshots set is_selected=not is_selected where order_id=$1 and order_line_id=$2';
  const editSql = 'update order_lines set quantity=quantity+1 where id=$1';
  if (process.argv.includes('--verify-old-lock')) {
    await disableGate();
    const definition = (await a.query("select pg_get_functiondef('private.invalidate_material_package_snapshot()'::regprocedure) as definition")).rows[0].definition;
    await a.query(`create or replace function private.invalidate_material_package_snapshot()
      returns trigger language plpgsql security definer set search_path=public,pg_temp as $body$
      begin
        update public.order_lines set quantity=quantity where id=coalesce(new.order_line_id,old.order_line_id);
        if tg_op='DELETE' then return old; end if;
        return new;
      end; $body$`);
    try {
      await assert.rejects(race('old choice lock control', editSql, [line], choiceSql, [order,line]), /deadlock detected/);
      console.log('PASS regression control reproduces package-choice deadlock');
    } finally { await a.query(definition); await a.query(gateDefinition); }
  }
  await a.query('update order_lines set quantity=20 where id=$1', [line]);
  await a.query('update order_package_choice_snapshots set is_selected=false where order_line_id=$1', [line]);
  for (let attempt=0; attempt<5; attempt++) {
    await race('package choice versus quantity edit', editSql, [line], choiceSql, [order,line]);
  }
  assert.equal(Number((await a.query('select sum(allocated_quantity) as total from order_line_delivery_allocations where order_line_id=$1', [line])).rows[0].total), 25);
  assert.equal(Number((await a.query("select required_quantity from private.catering_line_material_requirements($1) where ingredient_id='10000000-0000-0000-0000-000000000001'", [line])).rows[0].required_quantity), 50);
  const secondLine='40000000-0000-0000-0000-000000000099';
  await a.query('insert into order_lines(id,order_id,quantity) values ($1,$2,1)', [secondLine,order]);
  async function batchRace() {
    await a.query('begin');
    await a.query('update order_lines set quantity=quantity+1 where id=$1', [secondLine]);
    const waiting=b.query('update order_lines set quantity=quantity+1 where id=$1', [line]).then(()=>null,error=>error);
    try {
      await waitForAdvisory();
      await a.query('update order_lines set quantity=quantity+1 where id=$1', [line]);
      await a.query('commit');
      const error=await waiting; if(error)throw error;
    } catch(error){await a.query('rollback');await waiting;throw error;}
    console.log('PASS multi-line transaction versus quantity edit');
  }
  if (process.argv.includes('--verify-old-lock')) {
    await disableGate();
    try {
      await assert.rejects(batchRace(), /deadlock detected/);
      console.log('PASS regression control reproduces multi-line deadlock');
    } finally { await a.query(gateDefinition); }
  }
  const beforeBatch=Number((await a.query('select quantity from order_lines where id=$1',[line])).rows[0].quantity);
  for(let attempt=0;attempt<5;attempt++) await batchRace();
  assert.equal(Number((await a.query('select quantity from order_lines where id=$1',[line])).rows[0].quantity),beforeBatch+10);
  await race('direct update versus bulk upsert',
    'insert into order_lines(id,order_id,quantity) values ($1,$2,30) on conflict(id) do update set quantity=excluded.quantity',
    [line,order], 'update order_lines set quantity=quantity+1 where id=$1', [line]);
  assert.equal(Number((await a.query('select quantity from order_lines where id=$1',[line])).rows[0].quantity),30);
  const saveSignature='public.save_sales_document_batch(uuid,text,jsonb,numeric,numeric,numeric,numeric,jsonb,uuid,text,jsonb)';
  const saveDefinition=(await a.query('select pg_get_functiondef($1::regprocedure) as definition',[saveSignature])).rows[0].definition;
  const saveSql="select public.save_sales_document_batch($1,'order',$2::jsonb,0,0,0,0,'[]'::jsonb,null,null,'{}'::jsonb)";
  const saveParams=[order,JSON.stringify([{id:line,quantity:30,unit_price:1}])];
  const orderEdit='update orders set order_number=order_number where id=$1';
  if(process.argv.includes('--verify-old-lock')) {
    const oldSave=saveDefinition.replace('  perform private.lock_material_writes();','');
    assert.notEqual(oldSave,saveDefinition);
    await a.query(oldSave);
    try {
      await assert.rejects(race('old sales RPC control',saveSql,saveParams,orderEdit,[order]),/deadlock detected/);
      console.log('PASS regression control reproduces existing sales RPC deadlock');
    } finally {await a.query(saveDefinition);}
  }
  for(let attempt=0;attempt<5;attempt++) await race('actual sales RPC versus order update',saveSql,saveParams,orderEdit,[order]);
  assert.equal(Number((await a.query('select quantity from order_lines where id=$1',[line])).rows[0].quantity),30);
  const quoteSql="select * from public.create_quote(p_channel_id:=$1,p_customer_name:='Gate Quote')";
  const quoteParams=['00000000-0000-0000-0000-000000000010'];
  const quoteDefinition=(await a.query("select pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and proname='create_quote'")).rows[0].definition;
  if(process.argv.includes('--verify-old-lock')) {
    const oldQuote=quoteDefinition.replace('  perform private.lock_material_writes();','');
    assert.notEqual(oldQuote,quoteDefinition);
    await a.query(oldQuote);
    try {
      await assert.rejects(race('old quote-number control',quoteSql,quoteParams,quoteSql,quoteParams),/deadlock detected/);
      console.log('PASS regression control reproduces quote-number deadlock');
    }finally{await a.query(quoteDefinition);}
  }
  const beforeQuotes=Number((await a.query("select count(*) from orders where customer_name_snapshot='Gate Quote'")).rows[0].count);
  for(let attempt=0;attempt<5;attempt++) await race('actual quote creation versus gated quote creation',quoteSql,quoteParams,quoteSql,quoteParams);
  const quotes=(await a.query("select count(*) as total,count(distinct order_number) as distinct_numbers from orders where customer_name_snapshot='Gate Quote'")).rows[0];
  assert.equal(Number(quotes.total),beforeQuotes+10);
  assert.equal(Number(quotes.distinct_numbers),Number(quotes.total));
} finally {
  for (const client of clients) await client.end();
  if (postgres) await run(join(bin, 'pg_ctl.exe'), ['-D', data, 'stop', '-m', 'fast'], { windowsHide: true });
  if (!resolve(data).startsWith(resolve(prefix))) throw new Error('Unexpected test cluster path');
  await rm(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
