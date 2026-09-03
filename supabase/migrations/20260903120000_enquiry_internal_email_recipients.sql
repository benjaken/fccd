-- Internal enquiry mail uses login-enabled staff with email_noti, matching the
-- order notification audience. Extra notification addresses are included when
-- that table exists.

create or replace function public.enquiry_internal_email_recipients()
returns table (
  recipient_name text,
  recipient_address text
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  return query
  select distinct
    coalesce(nullif(btrim(profile.user_name), ''), btrim(profile.email)),
    btrim(profile.email)
  from public.user_profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.email_noti
    and profile.login_enabled
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= now())
    and nullif(btrim(profile.email), '') is not null;

  if to_regclass('public.order_email_notification_addresses') is not null then
    return query execute $q$
      select distinct
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
        and nullif(btrim(address.email), '') is not null
    $q$;
  end if;
end;
$$;

revoke all on function public.enquiry_internal_email_recipients() from public, anon, authenticated;
grant execute on function public.enquiry_internal_email_recipients() to service_role;
