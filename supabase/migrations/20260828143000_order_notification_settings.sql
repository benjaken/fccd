-- Order settings: internal email recipients and first order-entry reminder
-- recipients. Phone values are text so prefixes and formatting are retained.

create table public.order_first_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  phone text not null check (btrim(phone) <> ''),
  delay_hours numeric(8, 2) not null default 12 check (delay_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_first_notification_recipients_created_idx
  on public.order_first_notification_recipients (created_at, id);

alter table public.order_first_notification_recipients enable row level security;
revoke all on public.order_first_notification_recipients from anon, authenticated;
grant all on public.order_first_notification_recipients to service_role;

insert into public.app_pages (
  page_key,
  display_name,
  route,
  sort_order,
  is_high_risk,
  parent_page_key,
  page_kind
)
values
  (
    'orders.settings.email_notifications',
    '電郵通知',
    '/orders/settings/email-notifications',
    31,
    false,
    'orders.settings',
    'subpage'
  ),
  (
    'orders.settings.first_notification_recipients',
    '入單第一通知人',
    '/orders/settings/first-notification-recipients',
    32,
    false,
    'orders.settings',
    'subpage'
  )
on conflict (page_key) do update
set display_name = excluded.display_name,
    route = excluded.route,
    sort_order = excluded.sort_order,
    is_high_risk = excluded.is_high_risk,
    parent_page_key = excluded.parent_page_key,
    page_kind = excluded.page_kind,
    updated_at = now();

with roles(role) as (
  values ('Super Admin'), ('Admin'), ('Accounting'), ('Factory'),
         ('Shop manager'), ('Customer_Main'), ('Customer_Sub')
), pages(page_key) as (
  values
    ('orders.settings.email_notifications'),
    ('orders.settings.first_notification_recipients')
), inherited as (
  select
    roles.role,
    pages.page_key,
    coalesce(parent.can_access, false) as can_access,
    coalesce(parent.can_manage, false) as can_manage
  from roles
  cross join pages
  left join public.role_page_permissions as parent
    on parent.role = roles.role
   and parent.page_key = 'orders.settings'
)
insert into public.role_page_permissions (role, page_key, can_access, can_manage)
select role, page_key, can_access, can_manage
from inherited
on conflict (role, page_key) do update
set can_access = excluded.can_access,
    can_manage = excluded.can_manage,
    updated_at = now();

create or replace function public.order_email_notification_user_list()
returns table (
  user_id uuid,
  user_name text,
  email text,
  enabled boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('orders.settings.email_notifications') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select profile.id,
    coalesce(nullif(btrim(profile.user_name), ''), nullif(btrim(profile.email), ''), '—'),
    profile.email,
    coalesce(profile.email_noti, false)
  from public.user_profiles as profile
  where nullif(btrim(profile.email), '') is not null
  order by lower(coalesce(nullif(btrim(profile.user_name), ''), profile.email)), profile.id;
end;
$$;

create or replace function public.set_order_email_notification_user(
  p_user_id uuid,
  p_enabled boolean
)
returns table (
  user_id uuid,
  user_name text,
  email text,
  enabled boolean
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_manage('orders.settings.email_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;

  update public.user_profiles as profile
  set email_noti = coalesce(p_enabled, false),
      updated_at = now()
  where profile.id = p_user_id
    and nullif(btrim(profile.email), '') is not null;

  if not found then
    raise exception 'notification_user_not_found' using errcode = 'P0002';
  end if;

  return query
  select profile.id,
    coalesce(nullif(btrim(profile.user_name), ''), nullif(btrim(profile.email), ''), '—'),
    profile.email,
    coalesce(profile.email_noti, false)
  from public.user_profiles as profile
  where profile.id = p_user_id;
end;
$$;

create or replace function public.order_first_notification_recipient_list()
returns table (
  id uuid,
  name text,
  phone text,
  delay_hours numeric
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_access('orders.settings.first_notification_recipients') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select recipient.id, recipient.name, recipient.phone, recipient.delay_hours
  from public.order_first_notification_recipients as recipient
  order by recipient.created_at, recipient.id;
end;
$$;

create or replace function public.save_order_first_notification_recipient(
  p_id uuid,
  p_name text,
  p_phone text,
  p_delay_hours numeric
)
returns table (
  id uuid,
  name text,
  phone text,
  delay_hours numeric
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
begin
  if not private.has_page_manage('orders.settings.first_notification_recipients') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if v_phone = '' then
    raise exception 'phone_required' using errcode = '22023';
  end if;
  if p_delay_hours is null or p_delay_hours < 0 then
    raise exception 'delay_hours_invalid' using errcode = '22023';
  end if;

  insert into public.order_first_notification_recipients as recipient (
    id, name, phone, delay_hours
  ) values (
    v_id, v_name, v_phone, p_delay_hours
  )
  on conflict (id) do update
  set name = excluded.name,
      phone = excluded.phone,
      delay_hours = excluded.delay_hours,
      updated_at = now();

  return query
  select recipient.id, recipient.name, recipient.phone, recipient.delay_hours
  from public.order_first_notification_recipients as recipient
  where recipient.id = v_id;
end;
$$;

create or replace function public.delete_order_first_notification_recipient(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_manage('orders.settings.first_notification_recipients') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;

  delete from public.order_first_notification_recipients
  where id = p_id;

  if not found then
    raise exception 'notification_recipient_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.order_email_notification_user_list()
  from public, anon;
revoke all on function public.set_order_email_notification_user(uuid, boolean)
  from public, anon;
revoke all on function public.order_first_notification_recipient_list()
  from public, anon;
revoke all on function public.save_order_first_notification_recipient(uuid, text, text, numeric)
  from public, anon;
revoke all on function public.delete_order_first_notification_recipient(uuid)
  from public, anon;

grant execute on function public.order_email_notification_user_list()
  to authenticated;
grant execute on function public.set_order_email_notification_user(uuid, boolean)
  to authenticated;
grant execute on function public.order_first_notification_recipient_list()
  to authenticated;
grant execute on function public.save_order_first_notification_recipient(uuid, text, text, numeric)
  to authenticated;
grant execute on function public.delete_order_first_notification_recipient(uuid)
  to authenticated;

-- Durable delivery queue for internal notifications created from the settings
-- above. Recipient values are snapshotted so a later settings change cannot
-- redirect an already queued message.
create table public.order_internal_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient_key text not null,
  recipient_name text not null,
  recipient_address text not null,
  scheduled_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_response jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, channel, recipient_key)
);

create index order_internal_notification_outbox_pending_idx
  on public.order_internal_notification_outbox (scheduled_at, created_at)
  where status in ('pending', 'failed');

alter table public.order_internal_notification_outbox enable row level security;
revoke all on public.order_internal_notification_outbox from anon, authenticated;
grant all on public.order_internal_notification_outbox to service_role;

create or replace function private.enqueue_internal_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.document_type <> 'order' or new.archived_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.document_type is not distinct from new.document_type then
    return new;
  end if;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address,
    scheduled_at
  )
  select
    new.id,
    'email',
    profile.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), profile.email),
    btrim(profile.email),
    now()
  from public.user_profiles as profile
  where profile.email_noti
    and nullif(btrim(profile.email), '') is not null
  on conflict (order_id, channel, recipient_key) do nothing;

  insert into public.order_internal_notification_outbox (
    order_id, channel, recipient_key, recipient_name, recipient_address,
    scheduled_at
  )
  select
    new.id,
    'whatsapp',
    recipient.id::text,
    recipient.name,
    recipient.phone,
    now() + recipient.delay_hours * interval '1 hour'
  from public.order_first_notification_recipients as recipient
  on conflict (order_id, channel, recipient_key) do nothing;

  return new;
end;
$$;

drop trigger if exists enqueue_internal_order_notifications on public.orders;
create trigger enqueue_internal_order_notifications
after insert or update of document_type on public.orders
for each row execute function private.enqueue_internal_order_notifications();

create or replace function public.claim_order_internal_notifications(
  p_limit integer default 20
)
returns setof public.order_internal_notification_outbox
language sql
security definer
set search_path = public
as $$
  update public.order_internal_notification_outbox as outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = now(),
      updated_at = now()
  where outbox.id in (
    select candidate.id
    from public.order_internal_notification_outbox as candidate
    where (
        candidate.status in ('pending', 'failed')
        or (
          candidate.status = 'processing'
          and candidate.locked_at < now() - interval '10 minutes'
        )
      )
      and candidate.scheduled_at <= now()
      and candidate.attempts < 5
    order by candidate.scheduled_at, candidate.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  returning outbox.*;
$$;

revoke all on function public.claim_order_internal_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_order_internal_notifications(integer)
  to service_role;
