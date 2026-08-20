-- Frozen supplier quote analysis: persistent documents, reviewed lines,
-- normalized matching, alerts, and private source files.

insert into public.app_pages (
  page_key, display_name, route, sort_order, is_high_risk,
  parent_page_key, page_kind
)
values
  ('frozen.supplier_quotes.upload', '供應商報價上傳', '/frozen/supplier-quotes', 541, false, 'frozen.supplier_quotes', 'action'),
  ('frozen.supplier_quotes.review', '供應商報價審核', '/frozen/supplier-quotes', 542, false, 'frozen.supplier_quotes', 'action'),
  ('frozen.supplier_quotes.export', '供應商報價匯出', '/frozen/supplier-quotes', 543, false, 'frozen.supplier_quotes', 'action'),
  ('frozen.supplier_quotes.settings', '供應商報價設定', '/frozen/supplier-quotes', 544, false, 'frozen.supplier_quotes', 'action')
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
         ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages(page_key) as (
  values
    ('frozen.supplier_quotes.upload'),
    ('frozen.supplier_quotes.review'),
    ('frozen.supplier_quotes.export'),
    ('frozen.supplier_quotes.settings')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  pages.page_key,
  case
    when pages.page_key = 'frozen.supplier_quotes.upload'
      then roles.role in ('Super Admin', 'Admin', 'Factory')
    when pages.page_key = 'frozen.supplier_quotes.review'
      then roles.role in ('Super Admin', 'Admin', 'Factory')
    when pages.page_key = 'frozen.supplier_quotes.export'
      then roles.role in ('Super Admin', 'Admin', 'Factory', 'Accounting')
    when pages.page_key = 'frozen.supplier_quotes.settings'
      then roles.role in ('Super Admin', 'Admin')
    else false
  end,
  case
    when pages.page_key = 'frozen.supplier_quotes.settings'
      then roles.role in ('Super Admin', 'Admin')
    when pages.page_key in ('frozen.supplier_quotes.upload', 'frozen.supplier_quotes.review')
      then roles.role in ('Super Admin', 'Admin', 'Factory')
    else false
  end
from roles cross join pages
on conflict (role, page_key) do update
set can_access = excluded.can_access,
    can_manage = excluded.can_manage,
    updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-quotes-private',
  'supplier-quotes-private',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.supplier_quote_profiles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  profile_version integer not null default 1,
  supplier_identifiers jsonb not null default '{}'::jsonb,
  header_footer_rules jsonb not null default '{}'::jsonb,
  table_mapping jsonb not null default '{}'::jsonb,
  product_code_rules jsonb not null default '{}'::jsonb,
  price_unit_rules jsonb not null default '{}'::jsonb,
  condition_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, profile_version)
);

create table if not exists public.supplier_quote_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  original_filename text not null,
  storage_bucket text not null default 'supplier-quotes-private',
  storage_path text not null,
  sha256 text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null default 0,
  quote_date date,
  effective_date date,
  detected_dates jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'review', 'confirmed', 'ocr_required', 'parse_failed')),
  parser_version text not null default 'pdf-text/0.1',
  raw_extraction jsonb not null default '{}'::jsonb,
  is_baseline boolean not null default false,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sha256)
);

create table if not exists public.supplier_quote_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.supplier_quote_documents(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  raw_meat_item_id uuid references public.raw_meat_items(id) on delete set null,
  supplier_item_code text,
  product_name text not null,
  product_name_zh text,
  origin text,
  size_text text,
  packing_text text,
  processing_method text,
  normalized_spec_fingerprint text not null default '',
  currency text not null default 'HKD',
  price_unit text not null default 'kg' check (price_unit in ('kg', 'box', 'unit')),
  quoted_price numeric(14,4),
  raw_quoted_price text,
  availability text not null default 'quoted' check (availability in ('quoted', 'tba', 'unavailable')),
  source_page integer,
  source_text text,
  match_confidence numeric(5,4),
  match_reason text,
  selection_status text not null default 'candidate' check (selection_status in ('candidate', 'confirmed', 'unmatched', 'skipped')),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_quote_aliases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  raw_meat_item_id uuid not null references public.raw_meat_items(id) on delete cascade,
  supplier_item_code text,
  supplier_product_name text not null,
  normalized_spec_fingerprint text not null default '',
  confidence numeric(5,4) not null default 1,
  source_line_id uuid references public.supplier_quote_lines(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_quote_conditions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.supplier_quote_documents(id) on delete cascade,
  line_id uuid references public.supplier_quote_lines(id) on delete cascade,
  condition_type text not null default 'other',
  raw_text text not null,
  normalized_value jsonb not null default '{}'::jsonb,
  review_state text not null default 'pending' check (review_state in ('pending', 'confirmed', 'rejected', 'not_applicable')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_quote_thresholds (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete cascade,
  rise_percent numeric(8,4) not null default 10,
  fall_percent numeric(8,4) not null default 10,
  include_spec_changes boolean not null default true,
  include_pending boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id)
);

create table if not exists public.supplier_quote_alerts (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.supplier_quote_lines(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  change_percent numeric(8,4),
  previous_price numeric(14,4),
  latest_price numeric(14,4),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'dismissed')),
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_quote_aliases_match_key
  on public.supplier_quote_aliases (supplier_id, raw_meat_item_id, normalized_spec_fingerprint);
create index if not exists supplier_quote_documents_supplier_date_idx
  on public.supplier_quote_documents (supplier_id, quote_date desc);
create index if not exists supplier_quote_lines_document_idx
  on public.supplier_quote_lines (document_id);
create index if not exists supplier_quote_lines_item_date_idx
  on public.supplier_quote_lines (raw_meat_item_id, selection_status, created_at desc);
create index if not exists supplier_quote_alerts_status_idx
  on public.supplier_quote_alerts (status, created_at desc);

alter table public.supplier_quote_documents enable row level security;
alter table public.supplier_quote_profiles enable row level security;
alter table public.supplier_quote_lines enable row level security;
alter table public.supplier_quote_aliases enable row level security;
alter table public.supplier_quote_conditions enable row level security;
alter table public.supplier_quote_thresholds enable row level security;
alter table public.supplier_quote_alerts enable row level security;

grant select on public.supplier_quote_profiles,
  public.supplier_quote_documents,
  public.supplier_quote_lines,
  public.supplier_quote_aliases,
  public.supplier_quote_conditions,
  public.supplier_quote_thresholds,
  public.supplier_quote_alerts to authenticated;

create policy "Supplier quote readers read profiles"
  on public.supplier_quote_profiles for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote settings manage profiles"
  on public.supplier_quote_profiles for all to authenticated
  using (private.has_page_access('frozen.supplier_quotes.settings'))
  with check (private.has_page_access('frozen.supplier_quotes.settings'));

create policy "Supplier quote readers read documents"
  on public.supplier_quote_documents for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote reviewers update documents"
  on public.supplier_quote_documents for update to authenticated
  using (private.has_page_access('frozen.supplier_quotes.review'))
  with check (private.has_page_access('frozen.supplier_quotes.review'));

create policy "Supplier quote readers read lines"
  on public.supplier_quote_lines for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote reviewers update lines"
  on public.supplier_quote_lines for update to authenticated
  using (private.has_page_access('frozen.supplier_quotes.review'))
  with check (private.has_page_access('frozen.supplier_quotes.review'));

create policy "Supplier quote readers read aliases"
  on public.supplier_quote_aliases for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote reviewers manage aliases"
  on public.supplier_quote_aliases for all to authenticated
  using (private.has_page_access('frozen.supplier_quotes.review'))
  with check (private.has_page_access('frozen.supplier_quotes.review'));

create policy "Supplier quote readers read conditions"
  on public.supplier_quote_conditions for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote reviewers manage conditions"
  on public.supplier_quote_conditions for all to authenticated
  using (private.has_page_access('frozen.supplier_quotes.review'))
  with check (private.has_page_access('frozen.supplier_quotes.review'));

create policy "Supplier quote readers read thresholds"
  on public.supplier_quote_thresholds for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote settings manage thresholds"
  on public.supplier_quote_thresholds for all to authenticated
  using (private.has_page_access('frozen.supplier_quotes.settings'))
  with check (private.has_page_access('frozen.supplier_quotes.settings'));

create policy "Supplier quote readers read alerts"
  on public.supplier_quote_alerts for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote reviewers update alerts"
  on public.supplier_quote_alerts for update to authenticated
  using (private.has_page_access('frozen.supplier_quotes.review'))
  with check (private.has_page_access('frozen.supplier_quotes.review'));

create policy "Supplier quote readers read suppliers"
  on public.suppliers for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote readers read raw meat items"
  on public.raw_meat_items for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));
create policy "Supplier quote readers read stock movements"
  on public.raw_meat_stock_movements for select to authenticated
  using (private.has_page_access('frozen.supplier_quotes'));

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
begin
  if not private.has_page_access('frozen.supplier_quotes.review') then
    raise exception 'insufficient_privilege';
  end if;
  if p_supplier_id is null or p_quote_date is null or p_effective_date is null then
    raise exception 'supplier_and_dates_required';
  end if;
  if p_effective_date < p_quote_date then
    raise exception 'effective_date_before_quote_date';
  end if;
  if not exists (select 1 from public.supplier_quote_documents where id = p_document_id) then
    raise exception 'supplier_quote_document_not_found';
  end if;
  if jsonb_typeof(coalesce(p_selections, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_supplier_quote_selections';
  end if;

  update public.supplier_quote_documents
  set supplier_id = p_supplier_id,
      quote_date = p_quote_date,
      effective_date = p_effective_date,
      is_baseline = coalesce(p_is_baseline, false),
      status = 'confirmed',
      confirmed_by = auth.uid(),
      confirmed_at = now(),
      updated_at = now()
  where id = p_document_id;

  update public.supplier_quote_lines
  set selection_status = 'skipped',
      updated_at = now()
  where document_id = p_document_id;

  update public.supplier_quote_lines as line
  set supplier_id = p_supplier_id,
      raw_meat_item_id = nullif(selection.raw_meat_item_id, '')::uuid,
      selection_status = case
        when nullif(selection.raw_meat_item_id, '') is null then 'unmatched'
        else 'confirmed'
      end,
      normalized_spec_fingerprint = coalesce(nullif(selection.normalized_spec_fingerprint, ''), line.normalized_spec_fingerprint),
      confirmed_by = auth.uid(),
      confirmed_at = now(),
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_selections, '[]'::jsonb)) as selection(
    line_id uuid,
    raw_meat_item_id text,
    normalized_spec_fingerprint text
  )
  where line.id = selection.line_id
    and line.document_id = p_document_id;

  insert into public.supplier_quote_aliases (
    supplier_id, raw_meat_item_id, supplier_item_code,
    supplier_product_name, normalized_spec_fingerprint,
    confidence, source_line_id, updated_at
  )
  select
    p_supplier_id,
    line.raw_meat_item_id,
    line.supplier_item_code,
    line.product_name,
    line.normalized_spec_fingerprint,
    coalesce(line.match_confidence, 1),
    line.id,
    now()
  from public.supplier_quote_lines line
  where line.document_id = p_document_id
    and line.selection_status = 'confirmed'
    and line.raw_meat_item_id is not null
  on conflict (supplier_id, raw_meat_item_id, normalized_spec_fingerprint)
  do update set
    supplier_item_code = excluded.supplier_item_code,
    supplier_product_name = excluded.supplier_product_name,
    confidence = greatest(supplier_quote_aliases.confidence, excluded.confidence),
    source_line_id = excluded.source_line_id,
    updated_at = now();

  select count(*) into selected_count
  from public.supplier_quote_lines
  where document_id = p_document_id
    and selection_status = 'confirmed';

  if selected_count = 0 then
    raise exception 'supplier_quote_selection_required';
  end if;
  return p_document_id;
end;
$$;

revoke all on function public.confirm_supplier_quote_document(uuid, uuid, date, date, boolean, jsonb) from public, anon;
grant execute on function public.confirm_supplier_quote_document(uuid, uuid, date, date, boolean, jsonb) to authenticated;

create or replace function public.get_supplier_quote_actual_prices(
  p_supplier_id uuid default null,
  p_raw_meat_item_id uuid default null
)
returns table (
  supplier_id uuid,
  raw_meat_item_id uuid,
  movement_at timestamptz,
  inbound_unit_price numeric,
  inbound_quantity_kg numeric,
  inbound_total_amount numeric
)
language sql
security invoker
set search_path = public, private
as $$
  select
    movement.supplier_id,
    movement.raw_meat_item_id,
    movement.movement_at,
    movement.inbound_unit_price,
    movement.inbound_quantity_kg,
    movement.inbound_total_amount
  from public.raw_meat_stock_movements movement
  where private.has_page_access('frozen.supplier_quotes')
    and (p_supplier_id is null or movement.supplier_id = p_supplier_id)
    and (p_raw_meat_item_id is null or movement.raw_meat_item_id = p_raw_meat_item_id)
    and movement.inbound_unit_price is not null
  order by movement.movement_at desc nulls last;
$$;

grant execute on function public.get_supplier_quote_actual_prices(uuid, uuid) to authenticated;

create or replace function public.get_supplier_raw_meat_price_history(
  p_supplier_id uuid default null,
  p_raw_meat_item_id uuid default null,
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  supplier_id uuid,
  raw_meat_item_id uuid,
  movement_at timestamptz,
  inbound_unit_price numeric,
  inbound_quantity_kg numeric,
  inbound_total_amount numeric
)
language sql
security invoker
set search_path = public, private
as $$
  select
    movement.supplier_id,
    movement.raw_meat_item_id,
    movement.movement_at,
    movement.inbound_unit_price,
    movement.inbound_quantity_kg,
    movement.inbound_total_amount
  from public.raw_meat_stock_movements movement
  where private.has_page_access('frozen.supplier_quotes')
    and (p_supplier_id is null or movement.supplier_id = p_supplier_id)
    and (p_raw_meat_item_id is null or movement.raw_meat_item_id = p_raw_meat_item_id)
    and (p_from_date is null or movement.movement_at::date >= p_from_date)
    and (p_to_date is null or movement.movement_at::date <= p_to_date)
    and movement.inbound_unit_price is not null
  order by movement.movement_at desc nulls last;
$$;

grant execute on function public.get_supplier_raw_meat_price_history(uuid, uuid, date, date) to authenticated;
