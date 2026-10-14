-- Editable customer-portal sidebar pages. Staff edit them; customers only see published rows.

create table if not exists public.customer_portal_guides (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (char_length(btrim(title)) between 1 and 40),
  body text not null default '' check (char_length(body) <= 8000),
  sort_order integer not null,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.customer_portal_guides enable row level security;
revoke all on table public.customer_portal_guides from public, anon, authenticated;

insert into public.customer_portal_guides (slug, title, body, sort_order)
values
  ('about', '關於我們', '', 10),
  ('clients', '客戶清單', '', 20),
  ('cases', '真實案例', '', 30),
  ('company-meals', '公司訂飯', '', 40),
  ('promise', '服務承諾', '', 50)
on conflict (slug) do nothing;

create or replace function public.customer_portal_list_guides()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', slug,
    'title', title,
    'body', body
  ) order by sort_order, slug), '[]'::jsonb)
  from public.customer_portal_guides
  where is_published;
$$;

create or replace function public.customer_portal_ops_list_guides()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.customer_portal_ops_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', slug,
      'title', title,
      'body', body,
      'is_published', is_published,
      'sort_order', sort_order
    ) order by sort_order, slug)
    from public.customer_portal_guides
  ), '[]'::jsonb);
end;
$$;

create or replace function public.customer_portal_ops_save_guide(
  p_slug text,
  p_title text,
  p_body text,
  p_published boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := coalesce(p_body, '');
begin
  perform private.customer_portal_ops_require(true);
  if v_title = '' or char_length(v_title) > 40 or char_length(v_body) > 8000 then
    raise exception 'invalid_guide' using errcode = '22023';
  end if;
  update public.customer_portal_guides
  set title = v_title,
      body = v_body,
      is_published = coalesce(p_published, false),
      updated_at = now()
  where slug = p_slug;
  if not found then
    raise exception 'guide_not_found' using errcode = 'P0002';
  end if;
  return public.customer_portal_ops_list_guides();
end;
$$;

revoke all on function public.customer_portal_list_guides() from public, anon;
revoke all on function public.customer_portal_ops_list_guides() from public, anon;
revoke all on function public.customer_portal_ops_save_guide(text, text, text, boolean) from public, anon;
grant execute on function public.customer_portal_list_guides() to authenticated;
grant execute on function public.customer_portal_ops_list_guides() to authenticated;
grant execute on function public.customer_portal_ops_save_guide(text, text, text, boolean) to authenticated;
