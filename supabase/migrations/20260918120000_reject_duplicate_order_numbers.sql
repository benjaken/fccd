-- New orders and quotes can carry a manually typed order number. Reject it when
-- it already exists so the editor can prompt the user instead of creating a
-- duplicate document. The check runs after private.standardize_order_number so
-- "123" and "#123" (Catering) are compared in their canonical form, and the
-- trigger name sorts after zz_standardize_order_number.

create or replace function private.reject_duplicate_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(new.order_number), '') is null
     or new.archived_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.orders as existing
    where existing.archived_at is null
      and existing.order_number = new.order_number
      and existing.id is distinct from new.id
  ) then
    raise exception 'order_number_exists' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists zzz_reject_duplicate_order_number on public.orders;
create trigger zzz_reject_duplicate_order_number
before insert or update of order_number on public.orders
for each row execute function private.reject_duplicate_order_number();

revoke all on function private.reject_duplicate_order_number()
  from public, anon, authenticated;

create or replace function public.order_number_exists(
  p_order_number text,
  p_channel_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.orders as existing
    where existing.archived_at is null
      and existing.order_number = private.standardize_order_number(
        p_order_number,
        p_channel_id
      )
  );
$$;

revoke all on function public.order_number_exists(text, uuid) from public, anon;
grant execute on function public.order_number_exists(text, uuid) to authenticated;

comment on function public.order_number_exists(text, uuid) is
  'True when the canonical form of the given order number already exists.';
