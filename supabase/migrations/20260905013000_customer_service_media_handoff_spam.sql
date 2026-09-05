alter table public.customer_service_inbound_events
  add column if not exists message_type text not null default 'text',
  add column if not exists media_url text,
  add column if not exists spam_score numeric(4,3),
  add column if not exists spam_action text;

create table if not exists public.customer_service_spam_senders (
  environment text not null,
  phone_normalized text not null,
  disposition text not null default 'review'
    check (disposition in ('review', 'blocked', 'trusted')),
  strike_count integer not null default 0,
  last_reason text,
  last_seen_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (environment, phone_normalized)
);

create table if not exists public.customer_service_spam_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  provider_message_id text not null unique,
  phone_normalized text not null,
  message_type text not null,
  content_excerpt text,
  score numeric(4,3) not null check (score between 0 and 1),
  reasons text[] not null default '{}',
  action text not null check (action in ('filtered', 'allowed', 'manual_review')),
  created_at timestamptz not null default now()
);

create index if not exists customer_service_spam_events_phone_idx
  on public.customer_service_spam_events (environment, phone_normalized, created_at desc);

alter table public.customer_service_spam_senders enable row level security;
alter table public.customer_service_spam_events enable row level security;
revoke all on table public.customer_service_spam_senders from public, anon, authenticated;
revoke all on table public.customer_service_spam_events from public, anon, authenticated;
grant all on table public.customer_service_spam_senders to service_role;
grant all on table public.customer_service_spam_events to service_role;

create or replace function public.customer_service_record_spam_event(
  p_environment text,
  p_provider_message_id text,
  p_phone text,
  p_message_type text,
  p_content_excerpt text,
  p_score numeric,
  p_reasons text[],
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.customer_service_spam_events (
    environment, provider_message_id, phone_normalized, message_type,
    content_excerpt, score, reasons, action
  ) values (
    p_environment, p_provider_message_id, p_phone, p_message_type,
    left(coalesce(p_content_excerpt, ''), 500), greatest(0, least(1, p_score)),
    coalesce(p_reasons, '{}'), p_action
  ) on conflict (provider_message_id) do nothing;

  if p_action = 'filtered' then
    insert into public.customer_service_spam_senders as sender (
      environment, phone_normalized, disposition, strike_count,
      last_reason, last_seen_at, updated_at
    ) values (
      p_environment, p_phone, 'review', 1,
      array_to_string(coalesce(p_reasons, '{}'), ','), now(), now()
    )
    on conflict (environment, phone_normalized) do update set
      strike_count = sender.strike_count + 1,
      last_reason = excluded.last_reason,
      last_seen_at = now(),
      updated_at = now();
  end if;

  update public.customer_service_inbound_events
  set spam_score = greatest(0, least(1, p_score)), spam_action = p_action
  where provider_message_id = p_provider_message_id;
end;
$$;

revoke all on function public.customer_service_record_spam_event(text, text, text, text, text, numeric, text[], text) from public, anon, authenticated;
grant execute on function public.customer_service_record_spam_event(text, text, text, text, text, numeric, text[], text) to service_role;

create or replace function public.customer_service_set_spam_sender(
  p_phone text,
  p_disposition text,
  p_environment text default 'production'
)
returns void
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_disposition not in ('review', 'blocked', 'trusted') then
    raise exception 'invalid spam disposition';
  end if;
  insert into public.customer_service_spam_senders as sender (
    environment, phone_normalized, disposition, reviewed_by, reviewed_at, updated_at
  ) values (p_environment, p_phone, p_disposition, auth.uid(), now(), now())
  on conflict (environment, phone_normalized) do update set
    disposition = excluded.disposition,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now();
end;
$$;

revoke all on function public.customer_service_set_spam_sender(text, text, text) from public, anon;
grant execute on function public.customer_service_set_spam_sender(text, text, text) to authenticated;
