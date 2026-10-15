-- Split parent orders have been entered through their child orders.
create or replace function private.order_reconciliation_is_split(p_order_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    join public.order_statuses s on s.legacy_id = any(o.order_status_legacy_ids)
    where o.id = p_order_id and s.name in ('已拆單', '拆單')
  );
$$;
revoke all on function private.order_reconciliation_is_split(uuid) from public, anon, authenticated;

create or replace function private.exclude_split_order_missing_entry()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.issue_type in ('missing_fccd', 'unlinked_fccd')
    and private.order_reconciliation_is_split(new.order_id) then
    new.status := 'resolved';
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  return new;
end;
$$;
revoke all on function private.exclude_split_order_missing_entry() from public, anon, authenticated;
create trigger exclude_split_order_missing_entry
before insert or update on public.order_reconciliation_issues
for each row execute function private.exclude_split_order_missing_entry();

create or replace function private.close_split_order_missing_entry()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if private.order_reconciliation_is_split(new.id) then
    update public.order_reconciliation_issues
    set status = 'resolved', resolved_at = coalesce(resolved_at, now()), last_checked_at = now()
    where order_id = new.id and issue_type in ('missing_fccd', 'unlinked_fccd') and status = 'open';
  end if;
  return new;
end;
$$;
revoke all on function private.close_split_order_missing_entry() from public, anon, authenticated;
create trigger close_split_order_missing_entry
 after update of order_status_legacy_ids on public.orders
 for each row execute function private.close_split_order_missing_entry();

-- Also clear queued warnings immediately, including per-order daily WATI jobs.
create or replace function private.skip_split_order_missing_entry_alerts()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'resolved' and new.issue_type in ('missing_fccd', 'unlinked_fccd')
    and private.order_reconciliation_is_split(new.order_id) then
    update public.order_reconciliation_alert_outbox
    set status = 'skipped', locked_at = null,
      last_error = 'split_order_already_entered', updated_at = now()
    where issue_id = new.id and status in ('pending', 'processing', 'failed');
    update public.business_notifications
    set resolved_at = coalesce(resolved_at, now()), updated_at = now()
    where event_type = 'order_reconciliation_urgent' and entity_id = new.order_id
      and resolved_at is null
      and not exists (
        select 1 from public.order_reconciliation_issues i
        where i.order_id = new.order_id and i.status = 'open'
      );
  end if;
  return new;
end;
$$;
revoke all on function private.skip_split_order_missing_entry_alerts() from public, anon, authenticated;
create trigger skip_split_order_missing_entry_alerts
 after update on public.order_reconciliation_issues
 for each row execute function private.skip_split_order_missing_entry_alerts();

update public.order_reconciliation_issues i
set status = 'resolved', resolved_at = coalesce(resolved_at, now()), last_checked_at = now()
where i.issue_type in ('missing_fccd', 'unlinked_fccd')
  and private.order_reconciliation_is_split(i.order_id);
