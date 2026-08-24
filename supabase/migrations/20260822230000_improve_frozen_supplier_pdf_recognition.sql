-- Versioned, evidence-first supplier quote recognition pipeline.
-- This migration is additive: legacy documents and confirmed lines are not rewritten.

alter table public.supplier_quote_profiles
  add column if not exists layout_signature text,
  add column if not exists schema_version text not null default 'candidate/1',
  add column if not exists review_state text not null default 'active',
  add column if not exists supersedes_profile_id uuid references public.supplier_quote_profiles(id) on delete set null;

do $$ begin
  alter table public.supplier_quote_profiles
    add constraint supplier_quote_profiles_review_state_check
    check (review_state in ('draft', 'pending_review', 'active', 'retired'));
exception when duplicate_object then null;
end $$;

alter table public.supplier_quote_documents
  add column if not exists latest_parse_run_id uuid,
  add column if not exists extraction_storage_path text,
  add column if not exists extraction_summary jsonb not null default '{}'::jsonb,
  add column if not exists detected_suppliers jsonb not null default '[]'::jsonb,
  add column if not exists processing_stage text,
  add column if not exists last_error_code text,
  add column if not exists last_error_summary text;

alter table public.supplier_quote_documents
  drop constraint if exists supplier_quote_documents_status_check;
alter table public.supplier_quote_documents
  add constraint supplier_quote_documents_status_check
  check (status in ('draft', 'uploading', 'processing', 'review', 'confirmed', 'ocr_required', 'parse_failed'));

create table if not exists public.supplier_quote_parse_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.supplier_quote_documents(id) on delete cascade,
  attempt integer not null,
  status text not null default 'queued',
  current_stage text not null default 'extraction',
  parser_version text not null,
  candidate_schema_version text not null default 'candidate/1',
  profile_id uuid references public.supplier_quote_profiles(id) on delete set null,
  profile_version integer,
  model_provider text,
  model_name text,
  model_version text,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  retry_of uuid references public.supplier_quote_parse_runs(id) on delete set null,
  idempotency_key text,
  error_code text,
  error_summary text,
  is_recoverable boolean not null default false,
  stage_stats jsonb not null default '{}'::jsonb,
  cost_stats jsonb not null default '{}'::jsonb,
  extraction_storage_path text,
  extraction_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, attempt),
  unique (document_id, idempotency_key),
  check (attempt > 0),
  check (status in ('queued', 'running', 'review', 'ocr_required', 'parse_failed', 'succeeded', 'superseded')),
  check (current_stage in ('extraction', 'layout', 'recognition', 'validation', 'matching', 'publishing', 'complete')),
  check (char_length(coalesce(error_summary, '')) <= 500)
);

alter table public.supplier_quote_documents
  drop constraint if exists supplier_quote_documents_latest_parse_run_id_fkey;
alter table public.supplier_quote_documents
  add constraint supplier_quote_documents_latest_parse_run_id_fkey
  foreign key (latest_parse_run_id) references public.supplier_quote_parse_runs(id) on delete set null;

alter table public.supplier_quote_lines
  add column if not exists parse_run_id uuid references public.supplier_quote_parse_runs(id) on delete set null,
  add column if not exists candidate_schema_version text not null default 'legacy/1',
  add column if not exists raw_fields jsonb not null default '{}'::jsonb,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists validation_warnings jsonb not null default '[]'::jsonb,
  add column if not exists source_block_id text,
  add column if not exists parser_version text,
  add column if not exists profile_version integer,
  add column if not exists model_version text,
  add column if not exists match_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists human_product_name text,
  add column if not exists human_spec_fingerprint text,
  add column if not exists human_price_unit text,
  add column if not exists new_item_requested boolean not null default false,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.supplier_quote_lines alter column currency drop not null;
alter table public.supplier_quote_lines alter column price_unit drop not null;
alter table public.supplier_quote_lines drop constraint if exists supplier_quote_lines_price_unit_check;
alter table public.supplier_quote_lines
  add constraint supplier_quote_lines_price_unit_check
  check (price_unit is null or price_unit in ('kg', 'box', 'unit'));

alter table public.supplier_quote_conditions
  add column if not exists parse_run_id uuid references public.supplier_quote_parse_runs(id) on delete set null,
  add column if not exists source_page integer,
  add column if not exists source_scope text not null default 'document',
  add column if not exists evidence jsonb not null default '[]'::jsonb;

create index if not exists supplier_quote_parse_runs_document_idx
  on public.supplier_quote_parse_runs (document_id, attempt desc);
create index if not exists supplier_quote_parse_runs_status_idx
  on public.supplier_quote_parse_runs (status, updated_at desc);
create index if not exists supplier_quote_lines_parse_run_idx
  on public.supplier_quote_lines (parse_run_id, selection_status);
create index if not exists supplier_quote_lines_evidence_gin_idx
  on public.supplier_quote_lines using gin (evidence);
create index if not exists supplier_quote_profiles_layout_signature_idx
  on public.supplier_quote_profiles (supplier_id, layout_signature) where is_active;

alter table public.supplier_quote_parse_runs enable row level security;
grant select on public.supplier_quote_parse_runs to authenticated;

create policy "Supplier quote readers read parse runs"
  on public.supplier_quote_parse_runs for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));

-- Direct mutation remains service-role only. Authenticated callers use the retry
-- function below, which enforces the same upload permission as initial ingest.
create or replace function public.request_supplier_quote_retry(
  p_document_id uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  run_id uuid;
  latest_run public.supplier_quote_parse_runs%rowtype;
begin
  if not private.has_page_access('frozen.supplier_quotes.upload') then
    raise exception 'insufficient_privilege';
  end if;

  perform 1 from public.supplier_quote_documents where id = p_document_id for update;
  if not found then raise exception 'supplier_quote_document_not_found'; end if;

  if p_idempotency_key is not null then
    select id into run_id from public.supplier_quote_parse_runs
    where document_id = p_document_id and idempotency_key = p_idempotency_key;
    if run_id is not null then return run_id; end if;
  end if;

  select * into latest_run from public.supplier_quote_parse_runs
  where document_id = p_document_id order by attempt desc limit 1;

  insert into public.supplier_quote_parse_runs (
    document_id, attempt, status, current_stage, parser_version,
    started_by, retry_of, idempotency_key
  ) values (
    p_document_id, coalesce(latest_run.attempt, 0) + 1, 'queued', 'extraction',
    coalesce(latest_run.parser_version, 'pdf-layout/1.0'), auth.uid(), latest_run.id,
    nullif(p_idempotency_key, '')
  ) returning id into run_id;

  update public.supplier_quote_documents
  set latest_parse_run_id = run_id,
      status = case when status = 'confirmed' then 'confirmed' else 'processing' end,
      processing_stage = 'extraction',
      last_error_code = null, last_error_summary = null, updated_at = now()
  where id = p_document_id;
  return run_id;
end;
$$;

revoke all on function public.request_supplier_quote_retry(uuid, text) from public, anon;
grant execute on function public.request_supplier_quote_retry(uuid, text) to authenticated;

-- Service-side atomic publication. Only candidates from the latest run are
-- replaced; confirmed lines are deliberately outside the delete predicate.
create or replace function public.publish_supplier_quote_parse_run(
  p_run_id uuid,
  p_candidates jsonb,
  p_conditions jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_document_id uuid;
  inserted_count integer;
begin
  select document_id into target_document_id
  from public.supplier_quote_parse_runs where id = p_run_id for update;
  if not found then raise exception 'supplier_quote_parse_run_not_found'; end if;
  if not exists (
    select 1 from public.supplier_quote_documents
    where id = target_document_id and latest_parse_run_id = p_run_id
  ) then raise exception 'supplier_quote_parse_run_not_latest'; end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_conditions, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_supplier_quote_publication';
  end if;

  delete from public.supplier_quote_lines
  where document_id = target_document_id
    and selection_status <> 'confirmed';

  insert into public.supplier_quote_lines (
    document_id, parse_run_id, supplier_id, raw_meat_item_id, supplier_item_code,
    product_name, product_name_zh, origin, size_text, packing_text, processing_method,
    normalized_spec_fingerprint, currency, price_unit, quoted_price, raw_quoted_price,
    availability, source_page, source_text, source_block_id, raw_fields, evidence,
    parser_version, profile_version, model_version, candidate_schema_version,
    match_confidence, match_reason, match_breakdown, validation_errors,
    validation_warnings, selection_status
  )
  select target_document_id, p_run_id, nullif(c.supplier_id, '')::uuid,
    nullif(c.raw_meat_item_id, '')::uuid, nullif(c.supplier_item_code, ''),
    c.product_name, nullif(c.product_name_zh, ''), nullif(c.origin, ''),
    nullif(c.size_text, ''), nullif(c.packing_text, ''), nullif(c.processing_method, ''),
    c.normalized_spec_fingerprint, nullif(c.currency, ''), nullif(c.price_unit, ''),
    c.quoted_price, nullif(c.raw_quoted_price, ''), c.availability, c.source_page,
    c.source_text, c.source_block_id, coalesce(c.raw_fields, '{}'::jsonb),
    coalesce(c.evidence, '[]'::jsonb), c.parser_version, c.profile_version,
    nullif(c.model_version, ''), c.candidate_schema_version, c.match_confidence,
    c.match_reason, coalesce(c.match_breakdown, '{}'::jsonb),
    coalesce(c.validation_errors, '[]'::jsonb), coalesce(c.validation_warnings, '[]'::jsonb),
    case when jsonb_array_length(coalesce(c.validation_errors, '[]'::jsonb)) > 0 then 'unmatched' else 'candidate' end
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as c(
    supplier_id text, raw_meat_item_id text, supplier_item_code text, product_name text,
    product_name_zh text, origin text, size_text text, packing_text text,
    processing_method text, normalized_spec_fingerprint text, currency text,
    price_unit text, quoted_price numeric, raw_quoted_price text, availability text,
    source_page integer, source_text text, source_block_id text, raw_fields jsonb,
    evidence jsonb, parser_version text, profile_version integer, model_version text,
    candidate_schema_version text, match_confidence numeric, match_reason text,
    match_breakdown jsonb, validation_errors jsonb, validation_warnings jsonb
  );
  get diagnostics inserted_count = row_count;

  delete from public.supplier_quote_conditions
  where document_id = target_document_id and review_state <> 'confirmed';
  insert into public.supplier_quote_conditions (
    document_id, parse_run_id, condition_type, raw_text, source_page,
    source_scope, evidence
  )
  select target_document_id, p_run_id, coalesce(nullif(c.condition_type, ''), 'other'),
    c.raw_text, c.source_page, coalesce(nullif(c.source_scope, ''), 'document'),
    coalesce(c.evidence, '[]'::jsonb)
  from jsonb_to_recordset(coalesce(p_conditions, '[]'::jsonb)) as c(
    condition_type text, raw_text text, source_page integer, source_scope text, evidence jsonb
  );
  return inserted_count;
end;
$$;

revoke all on function public.publish_supplier_quote_parse_run(uuid, jsonb, jsonb) from public, anon, authenticated;

-- Confirmation is the only boundary that promotes candidates. It validates that
-- selected lines belong to the latest run, contain no validator errors, and have
-- an explicit item/variant/unit mapping. It never touches stock or item tables.
create or replace function public.confirm_supplier_quote_document(
  p_document_id uuid,
  p_supplier_id uuid,
  p_quote_date date,
  p_effective_date date,
  p_is_baseline boolean,
  p_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  selected_count integer;
  latest_run_id uuid;
begin
  if not private.has_page_access('frozen.supplier_quotes.review') then
    raise exception 'insufficient_privilege';
  end if;
  if p_supplier_id is null or p_quote_date is null or p_effective_date is null then
    raise exception 'supplier_and_dates_required';
  end if;
  if p_effective_date < p_quote_date then raise exception 'effective_date_before_quote_date'; end if;
  if jsonb_typeof(coalesce(p_selections, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_supplier_quote_selections';
  end if;

  select latest_parse_run_id into latest_run_id
  from public.supplier_quote_documents where id = p_document_id for update;
  if not found then raise exception 'supplier_quote_document_not_found'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_selections, '[]'::jsonb)) as selection(
      line_id uuid, raw_meat_item_id text, normalized_spec_fingerprint text,
      price_unit text, new_item_requested boolean
    )
    left join public.supplier_quote_lines line on line.id = selection.line_id
    where line.id is null
       or line.document_id <> p_document_id
       or (latest_run_id is not null and line.parse_run_id is distinct from latest_run_id)
       or jsonb_array_length(coalesce(line.validation_errors, '[]'::jsonb)) > 0
       or (nullif(selection.raw_meat_item_id, '') is null and not coalesce(selection.new_item_requested, false))
       or coalesce(nullif(selection.normalized_spec_fingerprint, ''), nullif(line.normalized_spec_fingerprint, '')) is null
       or coalesce(nullif(selection.price_unit, ''), nullif(line.price_unit, '')) is null
  ) then raise exception 'invalid_or_unmapped_supplier_quote_selection'; end if;

  update public.supplier_quote_lines
  set selection_status = 'skipped', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where document_id = p_document_id
    and selection_status in ('candidate', 'unmatched', 'skipped')
    and (latest_run_id is null or parse_run_id = latest_run_id);

  update public.supplier_quote_lines as line
  set supplier_id = p_supplier_id,
      raw_meat_item_id = nullif(selection.raw_meat_item_id, '')::uuid,
      selection_status = case when nullif(selection.raw_meat_item_id, '') is null then 'unmatched' else 'confirmed' end,
      normalized_spec_fingerprint = coalesce(nullif(selection.normalized_spec_fingerprint, ''), line.normalized_spec_fingerprint),
      human_spec_fingerprint = nullif(selection.normalized_spec_fingerprint, ''),
      price_unit = coalesce(nullif(selection.price_unit, ''), line.price_unit),
      human_price_unit = nullif(selection.price_unit, ''),
      new_item_requested = coalesce(selection.new_item_requested, false),
      reviewed_by = auth.uid(), reviewed_at = now(), confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
  from jsonb_to_recordset(coalesce(p_selections, '[]'::jsonb)) as selection(
    line_id uuid, raw_meat_item_id text, normalized_spec_fingerprint text,
    price_unit text, new_item_requested boolean
  )
  where line.id = selection.line_id and line.document_id = p_document_id;

  get diagnostics selected_count = row_count;
  if selected_count = 0 then raise exception 'supplier_quote_selection_required'; end if;

  insert into public.supplier_quote_aliases (
    supplier_id, raw_meat_item_id, supplier_item_code, supplier_product_name,
    normalized_spec_fingerprint, confidence, source_line_id, updated_at
  )
  select p_supplier_id, line.raw_meat_item_id, line.supplier_item_code,
    coalesce(line.human_product_name, line.product_name), line.normalized_spec_fingerprint,
    greatest(coalesce(line.match_confidence, 0), 0.95), line.id, now()
  from public.supplier_quote_lines line
  where line.document_id = p_document_id and line.selection_status = 'confirmed'
    and line.raw_meat_item_id is not null
  on conflict (supplier_id, raw_meat_item_id, normalized_spec_fingerprint)
  do update set supplier_item_code = excluded.supplier_item_code,
    supplier_product_name = excluded.supplier_product_name,
    confidence = greatest(public.supplier_quote_aliases.confidence, excluded.confidence),
    source_line_id = excluded.source_line_id, updated_at = now();

  update public.supplier_quote_documents
  set supplier_id = p_supplier_id, quote_date = p_quote_date, effective_date = p_effective_date,
      is_baseline = coalesce(p_is_baseline, false), status = 'confirmed', processing_stage = 'complete',
      confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
  where id = p_document_id;

  return p_document_id;
end;
$$;

revoke all on function public.confirm_supplier_quote_document(uuid, uuid, date, date, boolean, jsonb) from public, anon;
grant execute on function public.confirm_supplier_quote_document(uuid, uuid, date, date, boolean, jsonb) to authenticated;
