-- Release abandoned order-edit indicators sooner. Browser page unload also
-- attempts an immediate token-scoped release, while this timeout remains the
-- fallback for crashes, lost connectivity, and force-closed processes.

create or replace function public.active_order_edit_ids(p_order_ids uuid[])
returns table(order_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct session.order_id
  from public.order_edit_sessions session
  where session.order_id = any(coalesce(p_order_ids, array[]::uuid[]))
    and session.last_activity_at > now() - interval '15 minutes';
$$;

create or replace function public.is_order_edit_active(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_edit_sessions session
    where session.order_id = p_order_id
      and session.last_activity_at > now() - interval '15 minutes'
  );
$$;

comment on table public.order_edit_sessions is
  'Short-lived browser edit sessions. Factory printing treats sessions active within the last 15 minutes as a lock.';
