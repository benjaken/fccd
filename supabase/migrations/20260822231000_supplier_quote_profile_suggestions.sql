-- Human-reviewed mapping suggestions are stored separately from active profiles.
-- Confirmation may propose rules, but only settings users can activate profiles.

create table if not exists public.supplier_quote_profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.supplier_quote_documents(id) on delete cascade,
  parse_run_id uuid references public.supplier_quote_parse_runs(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  suggestion jsonb not null default '{}'::jsonb,
  review_state text not null default 'pending' check (review_state in ('pending', 'accepted', 'rejected')),
  suggested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, parse_run_id)
);

create index if not exists supplier_quote_profile_suggestions_supplier_idx
  on public.supplier_quote_profile_suggestions (supplier_id, review_state, created_at desc);

alter table public.supplier_quote_profile_suggestions enable row level security;
grant select, insert, update on public.supplier_quote_profile_suggestions to authenticated;

create policy "Supplier quote readers read profile suggestions"
  on public.supplier_quote_profile_suggestions for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote reviewers propose profile suggestions"
  on public.supplier_quote_profile_suggestions for insert to authenticated
  with check (private.has_page_access('frozen.supplier_quotes.review'));
create policy "Supplier quote settings review profile suggestions"
  on public.supplier_quote_profile_suggestions for update to authenticated
  using (private.has_page_access('frozen.supplier_quotes.settings'))
  with check (private.has_page_access('frozen.supplier_quotes.settings'));

create or replace function private.capture_supplier_quote_profile_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  proposed_rules jsonb;
begin
  if new.status <> 'confirmed' or new.supplier_id is null or new.processing_stage is distinct from 'complete' then
    return new;
  end if;

  select jsonb_build_object(
    'schema_version', 'profile-suggestion/1',
    'source_document_id', new.id,
    'source_parse_run_id', new.latest_parse_run_id,
    'field_mappings', coalesce(jsonb_agg(jsonb_build_object(
      'line_id', line.id,
      'raw_fields', line.raw_fields,
      'human_product_name', line.human_product_name,
      'human_spec_fingerprint', line.human_spec_fingerprint,
      'human_price_unit', line.human_price_unit
    ) order by line.source_page, line.id), '[]'::jsonb)
  ) into proposed_rules
  from public.supplier_quote_lines line
  where line.document_id = new.id
    and line.selection_status in ('confirmed', 'unmatched')
    and (new.latest_parse_run_id is null or line.parse_run_id = new.latest_parse_run_id);

  insert into public.supplier_quote_profile_suggestions (
    document_id, parse_run_id, supplier_id, suggestion, review_state,
    suggested_by, updated_at
  ) values (
    new.id, new.latest_parse_run_id, new.supplier_id, proposed_rules, 'pending',
    auth.uid(), now()
  )
  on conflict (document_id, parse_run_id) do update
  set supplier_id = excluded.supplier_id,
      suggestion = excluded.suggestion,
      review_state = 'pending',
      suggested_by = excluded.suggested_by,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists capture_supplier_quote_profile_suggestion
  on public.supplier_quote_documents;
create trigger capture_supplier_quote_profile_suggestion
after update of status, supplier_id, confirmed_at on public.supplier_quote_documents
for each row execute function private.capture_supplier_quote_profile_suggestion();
