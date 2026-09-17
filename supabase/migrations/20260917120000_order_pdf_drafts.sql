-- Persist the PDF-only edits made in the REC/INV PDF editors so staff do not
-- have to re-apply clauses, payment methods, shipping and discount overrides
-- every time they reopen a receipt or invoice. Source order fields (customer,
-- address, product lines, payment information, ...) are still re-read from
-- public.orders on every open; only the settings stored in `draft` survive.
begin;

create table if not exists public.order_pdf_drafts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  document_kind text not null check (document_kind in ('receipt', 'invoice')),
  draft jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, document_kind)
);

create or replace function private.set_order_pdf_drafts_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

revoke all on function private.set_order_pdf_drafts_updated_at()
  from public, anon, authenticated;

drop trigger if exists set_order_pdf_drafts_updated_at on public.order_pdf_drafts;
create trigger set_order_pdf_drafts_updated_at
before insert or update on public.order_pdf_drafts
for each row execute function private.set_order_pdf_drafts_updated_at();

alter table public.order_pdf_drafts enable row level security;
revoke all on table public.order_pdf_drafts from anon, authenticated;
grant select, insert, update on table public.order_pdf_drafts to authenticated;

drop policy if exists "Document managers read order pdf drafts"
  on public.order_pdf_drafts;
create policy "Document managers read order pdf drafts"
on public.order_pdf_drafts
for select
to authenticated
using (private.has_sales_document_manage(order_id));

drop policy if exists "Document managers insert order pdf drafts"
  on public.order_pdf_drafts;
create policy "Document managers insert order pdf drafts"
on public.order_pdf_drafts
for insert
to authenticated
with check (private.has_sales_document_manage(order_id));

drop policy if exists "Document managers update order pdf drafts"
  on public.order_pdf_drafts;
create policy "Document managers update order pdf drafts"
on public.order_pdf_drafts
for update
to authenticated
using (private.has_sales_document_manage(order_id))
with check (private.has_sales_document_manage(order_id));

commit;
