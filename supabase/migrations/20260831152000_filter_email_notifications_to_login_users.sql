-- Keep the order email-notification list and delivery audience aligned with
-- accounts that can currently authenticate.

create or replace function private.order_email_notification_recipients()
returns table (
  user_id uuid,
  recipient_key text,
  recipient_name text,
  recipient_address text
)
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
  select profile.id,
    profile.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
    btrim(profile.email)
  from public.user_profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.email_noti
    and profile.login_enabled
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= now())
    and nullif(btrim(profile.email), '') is not null

  union all

  select profile.id,
    profile.id::text || ':extra:' || address.id::text,
    coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
    btrim(address.email)
  from public.user_profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  join public.order_email_notification_addresses address
    on address.user_id = profile.id
  where profile.email_noti
    and profile.login_enabled
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= now())
    and lower(btrim(address.email)) <> lower(btrim(coalesce(profile.email, '')));
$$;

revoke all on function private.order_email_notification_recipients()
  from public, anon, authenticated;

create or replace function public.order_email_notification_user_list()
returns table (
  user_id uuid,
  user_name text,
  email text,
  enabled boolean,
  additional_emails jsonb
)
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
begin
  if not private.has_page_access('orders.settings.email_notifications') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;

  return query
  select profile.id,
    coalesce(nullif(btrim(profile.user_name), ''), nullif(btrim(profile.email), ''), '—'),
    profile.email,
    coalesce(profile.email_noti, false),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', address.id, 'email', btrim(address.email))
        order by lower(btrim(address.email)), address.id
      )
      from public.order_email_notification_addresses address
      where address.user_id = profile.id
    ), '[]'::jsonb)
  from public.user_profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.login_enabled
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= now())
    and nullif(btrim(profile.email), '') is not null
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
  enabled boolean,
  additional_emails jsonb
)
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
begin
  if not private.has_page_manage('orders.settings.email_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;

  update public.user_profiles profile
  set email_noti = coalesce(p_enabled, false),
      updated_at = now()
  where profile.id = p_user_id
    and profile.login_enabled
    and nullif(btrim(profile.email), '') is not null
    and exists (
      select 1
      from auth.users auth_user
      where auth_user.id = profile.id
        and auth_user.deleted_at is null
        and (auth_user.banned_until is null or auth_user.banned_until <= now())
    );

  if not found then
    raise exception 'notification_user_not_login_enabled' using errcode = 'P0002';
  end if;

  return query
  select profile.id,
    coalesce(nullif(btrim(profile.user_name), ''), nullif(btrim(profile.email), ''), '—'),
    profile.email,
    coalesce(profile.email_noti, false),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', address.id, 'email', btrim(address.email))
        order by lower(btrim(address.email)), address.id
      )
      from public.order_email_notification_addresses address
      where address.user_id = profile.id
    ), '[]'::jsonb)
  from public.user_profiles profile
  where profile.id = p_user_id;
end;
$$;

create or replace function public.save_order_email_notification_address(
  p_user_id uuid,
  p_email text
)
returns table (id uuid, user_id uuid, email text)
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.has_page_manage('orders.settings.email_notifications') then
    raise exception 'page_manage_required' using errcode = '42501';
  end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.user_profiles profile
    join auth.users auth_user on auth_user.id = profile.id
    where profile.id = p_user_id
      and profile.login_enabled
      and auth_user.deleted_at is null
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
  ) then
    raise exception 'notification_user_not_login_enabled' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.user_profiles profile
    where profile.id = p_user_id and lower(btrim(coalesce(profile.email, ''))) = v_email
  ) then
    raise exception 'notification_email_already_primary' using errcode = '23505';
  end if;

  return query
  insert into public.order_email_notification_addresses as address (user_id, email)
  values (p_user_id, v_email)
  on conflict (user_id, lower(btrim(email))) do update
    set updated_at = now()
  returning address.id, address.user_id, btrim(address.email);
end;
$$;

revoke all on function public.order_email_notification_user_list() from public, anon;
revoke all on function public.set_order_email_notification_user(uuid, boolean) from public, anon;
revoke all on function public.save_order_email_notification_address(uuid, text) from public, anon;
grant execute on function public.order_email_notification_user_list() to authenticated;
grant execute on function public.set_order_email_notification_user(uuid, boolean) to authenticated;
grant execute on function public.save_order_email_notification_address(uuid, text) to authenticated;
