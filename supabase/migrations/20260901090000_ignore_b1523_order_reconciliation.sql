-- A Shopify-sourced row is not automatically a missing FCCD order. Once it has
-- an operational delivery status, has been sent to the factory, or is marked
-- not to be sent, it is not actionable in the Shopify pending-review queue.
-- B-1523 is a separate known exception and must stay ignored even when the
-- recurring refresh rechecks it.

create or replace function private.enforce_order_reconciliation_exclusions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_number text;
  v_delivery_status text;
  v_is_sent_to_factory boolean;
  v_do_not_send_to_factory boolean;
begin
  select orders.order_number, orders.delivery_status,
    orders.is_sent_to_factory, orders.do_not_send_to_factory
  into v_order_number, v_delivery_status,
    v_is_sent_to_factory, v_do_not_send_to_factory
  from public.orders orders
  where orders.id = new.order_id;

  if regexp_replace(upper(coalesce(v_order_number, '')), '[^A-Z0-9]', '', 'g') = 'B1523'
    or (
      new.issue_type = 'missing_fccd'
      and (
        v_delivery_status is not null
        or coalesce(v_is_sent_to_factory, false)
        or coalesce(v_do_not_send_to_factory, false)
      )
    )
  then
    new.status := 'resolved';
    new.resolved_at := coalesce(new.resolved_at, new.last_checked_at, now());
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_order_reconciliation_exclusions()
  from public, anon, authenticated;

drop trigger if exists enforce_order_reconciliation_exclusions
  on public.order_reconciliation_issues;
create trigger enforce_order_reconciliation_exclusions
before insert or update on public.order_reconciliation_issues
for each row execute function private.enforce_order_reconciliation_exclusions();

-- Resolve already-open false positives immediately. The trigger prevents
-- subsequent reconciliation runs from reopening them.
update public.order_reconciliation_issues issue
set status = 'resolved',
    resolved_at = coalesce(issue.resolved_at, now()),
    last_checked_at = now()
from public.orders orders
where orders.id = issue.order_id
  and issue.issue_type = 'missing_fccd'
  and (
    regexp_replace(upper(coalesce(orders.order_number, '')), '[^A-Z0-9]', '', 'g') = 'B1523'
    or orders.delivery_status is not null
    or coalesce(orders.is_sent_to_factory, false)
    or coalesce(orders.do_not_send_to_factory, false)
  )
  and issue.status = 'open';

-- Cancel unsent alerts and close existing in-app warnings for every issue that
-- the corrected scope just resolved. Sent messages remain immutable history.
update public.order_reconciliation_alert_outbox outbox
set status = 'skipped',
    locked_at = null,
    last_error = 'reconciliation_order_ignored',
    updated_at = now()
from public.order_reconciliation_issues issue
where outbox.issue_id = issue.id
  and issue.issue_type = 'missing_fccd'
  and issue.status = 'resolved'
  and outbox.status in ('pending', 'processing', 'failed');

update public.business_notifications notice
set resolved_at = coalesce(notice.resolved_at, now()),
    updated_at = now()
where notice.event_type = 'order_reconciliation_urgent'
  and notice.entity_id in (
    select issue.order_id
    from public.order_reconciliation_issues issue
    where issue.issue_type = 'missing_fccd'
      and issue.status = 'resolved'
  )
  and notice.resolved_at is null;

-- The latest summary is what the dialog reads. Recalculate its issue totals so
-- the correction is visible without waiting for the next scheduled daily run.
update public.order_reconciliation_runs run
set missing_fccd_count = counts.missing_fccd_count,
    unlinked_fccd_count = counts.unlinked_fccd_count,
    factory_unsent_count = counts.factory_unsent_count,
    urgent_count = counts.urgent_count,
    completed_at = now()
from (
  select
    count(*) filter (where issue_type = 'missing_fccd')::integer as missing_fccd_count,
    count(*) filter (where issue_type = 'unlinked_fccd')::integer as unlinked_fccd_count,
    count(*) filter (where issue_type = 'factory_unsent')::integer as factory_unsent_count,
    count(*) filter (where severity = 'urgent')::integer as urgent_count
  from public.order_reconciliation_issues
  where status = 'open'
) counts
where run.run_date = (
  select max(latest.run_date) from public.order_reconciliation_runs latest
);
