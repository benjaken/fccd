-- Soft-delete helpers for frozen goods lists.

create or replace function public.archive_seasoning(p_seasoning_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  );
begin
  if caller_role not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'not authorized to delete seasonings'
      using errcode = '42501';
  end if;

  update public.seasonings
  set
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where id = p_seasoning_id;

  if not found then
    raise exception 'seasoning not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_seasoning(uuid) from public;
grant execute on function public.archive_seasoning(uuid) to authenticated;

comment on function public.archive_seasoning(uuid) is
  'Archives a seasonings row so it disappears from frozen goods lists.';

create or replace function public.archive_meat_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  );
begin
  if caller_role not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'not authorized to delete customers'
      using errcode = '42501';
  end if;

  update public.meat_customers
  set
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where id = p_customer_id;

  if not found then
    raise exception 'customer not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_meat_customer(uuid) from public;
grant execute on function public.archive_meat_customer(uuid) to authenticated;

comment on function public.archive_meat_customer(uuid) is
  'Archives a meat_customers row so it disappears from the customers list.';

create or replace function public.unapply_meat_seasoning_cost_version(
  p_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  );
begin
  if caller_role not in ('Super Admin', 'Admin', 'Factory') then
    raise exception 'not authorized to delete spice usages'
      using errcode = '42501';
  end if;

  update public.meat_seasoning_cost_versions
  set is_applied = false
  where id = p_version_id;

  if not found then
    raise exception 'seasoning usage not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.unapply_meat_seasoning_cost_version(uuid)
  from public;
grant execute on function public.unapply_meat_seasoning_cost_version(uuid)
  to authenticated;

comment on function public.unapply_meat_seasoning_cost_version(uuid) is
  'Removes an applied seasoning usage from the spice usage list without deleting history.';
