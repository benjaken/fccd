-- Brand-specific A4 pages inserted before or after generated quote pages.

create table public.quote_pdf_pages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  placement text not null check (placement in ('front', 'back')),
  title text not null,
  object_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quote_pdf_pages_channel_placement_order_idx
  on public.quote_pdf_pages (channel_id, placement, sort_order, created_at);

alter table public.quote_pdf_pages enable row level security;

grant select, insert, update, delete on public.quote_pdf_pages to authenticated;

create policy "Quote users read active PDF pages"
  on public.quote_pdf_pages for select to authenticated
  using (private.has_page_access('quotes'));

create policy "Quote PDF page managers insert pages"
  on public.quote_pdf_pages for insert to authenticated
  with check (private.has_page_manage('quotes.pdf_pages'));

create policy "Quote PDF page managers update pages"
  on public.quote_pdf_pages for update to authenticated
  using (private.has_page_manage('quotes.pdf_pages'))
  with check (private.has_page_manage('quotes.pdf_pages'));

create policy "Quote PDF page managers delete pages"
  on public.quote_pdf_pages for delete to authenticated
  using (private.has_page_manage('quotes.pdf_pages'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-pdf-pages',
  'quote-pdf-pages',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Quote users read PDF page objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'quote-pdf-pages'
    and private.has_page_access('quotes')
  );

create policy "Quote PDF page managers upload objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'quote-pdf-pages'
    and private.has_page_manage('quotes.pdf_pages')
  );

create policy "Quote PDF page managers replace objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'quote-pdf-pages'
    and private.has_page_manage('quotes.pdf_pages')
  )
  with check (
    bucket_id = 'quote-pdf-pages'
    and private.has_page_manage('quotes.pdf_pages')
  );

create policy "Quote PDF page managers remove objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'quote-pdf-pages'
    and private.has_page_manage('quotes.pdf_pages')
  );

insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values (
  'quotes.pdf_pages',
  '封面封底設定',
  '/quotes/pdf-pages',
  45,
  false,
  'quotes',
  'subpage'
)
on conflict (page_key) do update
set
  display_name = excluded.display_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_high_risk = excluded.is_high_risk,
  parent_page_key = excluded.parent_page_key,
  page_kind = excluded.page_kind,
  updated_at = now();

with roles(role) as (
  values
    ('Super Admin'),
    ('Admin'),
    ('Accounting'),
    ('Factory'),
    ('Shop manager'),
    ('Customer_Main'),
    ('Customer_Sub')
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select
  roles.role,
  'quotes.pdf_pages',
  roles.role in ('Super Admin', 'Admin'),
  roles.role in ('Super Admin', 'Admin')
from roles
on conflict (role, page_key) do update
set
  can_access = excluded.can_access,
  can_manage = excluded.can_manage,
  updated_at = now();
