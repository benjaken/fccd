-- Daily per-order readiness audit. This extends the existing 09:00 Hong Kong
-- reconciliation run, after the 08:45 Shopify refresh, and keeps WhatsApp
-- deduplication at one message per order/recipient/day.

alter table public.order_reconciliation_issues
  drop constraint if exists order_reconciliation_issues_issue_type_check;

alter table public.order_reconciliation_issues
  add constraint order_reconciliation_issues_issue_type_check
  check (issue_type in (
    'missing_fccd', 'unlinked_fccd', 'factory_unsent', 'missing_service_time',
    'missing_delivery_date', 'kitchen_not_visible', 'driver_unassigned',
    'insufficient_stock'
  ));

create or replace function public.inventory_forecast_order_shortages(
  p_start_date date default (timezone('Asia/Hong_Kong', now()))::date,
  p_days integer default 14
)
returns table (
  order_id uuid,
  shortage_items jsonb,
  unmapped_line_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with live_lines as (
    select line.*, orders.id as catering_order_id,
      coalesce(line.delivery_at, orders.delivery_at) as effective_delivery_at
    from public.order_lines line
    join public.orders orders on orders.id = line.order_id
    where orders.document_type = 'order'
      and orders.archived_at is null
      and orders.merged_into_order_id is null
      and coalesce(line.delivery_at, orders.delivery_at) >=
        (p_start_date::timestamp at time zone 'Asia/Hong_Kong')
      and coalesce(line.delivery_at, orders.delivery_at) <
        ((p_start_date + greatest(1, least(coalesce(p_days, 14), 31)))::timestamp at time zone 'Asia/Hong_Kong')
      and coalesce(orders.delivery_status, '') !~* '(cancel|取消|已送達|己送達)'
      and line.is_void is false
      and not exists (
        select 1 from public.order_material_consumptions consumption
        where consumption.order_line_id = line.id
      )
      and not exists (
        select 1 from public.order_list_manual_todos todo
        where todo.order_id = orders.id and todo.todo_key = 'cancelled'
      )
  ), snapshot_demand as (
    select line.catering_order_id as order_id,
      requirement.ingredient_id as item_id,
      sum(coalesce(requirement.calculated_quantity,
        requirement.ingredient_quantity * coalesce(requirement.product_quantity, line.quantity, 0), 0))::numeric as required_stock
    from live_lines line
    join public.order_bom_requirements requirement on requirement.order_line_id = line.id
    where requirement.ingredient_id is not null
    group by line.catering_order_id, requirement.ingredient_id
  ), direct_product_demand as (
    select line.catering_order_id as order_id, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as required_stock
    from live_lines line
    join public.product_ingredients recipe on recipe.product_id = line.product_id
    where line.product_id is not null
      and not exists (
        select 1 from public.order_bom_requirements requirement
        where requirement.order_line_id = line.id
      )
      and recipe.ingredient_id is not null
    group by line.catering_order_id, recipe.ingredient_id
  ), package_base_demand as (
    select line.catering_order_id as order_id, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0) * coalesce(line.quantity, 0))::numeric as required_stock
    from live_lines line
    join public.product_ingredients recipe on recipe.package_id = line.package_id
    where line.package_id is not null
      and not exists (
        select 1 from public.order_bom_requirements requirement
        where requirement.order_line_id = line.id
      )
      and recipe.ingredient_id is not null
    group by line.catering_order_id, recipe.ingredient_id
  ), selected_product_demand as (
    select line.catering_order_id as order_id, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1)
        * coalesce(line.quantity, 0))::numeric as required_stock
    from live_lines line
    join public.order_package_choice_snapshots choice
      on choice.order_line_id = line.id and choice.is_selected
    join public.package_products package_product on package_product.id = choice.package_product_id
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null
      and not exists (
        select 1 from public.order_bom_requirements requirement
        where requirement.order_line_id = line.id
      )
      and recipe.ingredient_id is not null
    group by line.catering_order_id, recipe.ingredient_id
  ), default_package_product_demand as (
    select line.catering_order_id as order_id, recipe.ingredient_id as item_id,
      sum(coalesce(recipe.quantity, recipe.test_quantity, 0)
        * coalesce(package_product.quantity, 1)
        * coalesce(line.quantity, 0))::numeric as required_stock
    from live_lines line
    join public.package_products package_product
      on package_product.package_id = line.package_id and package_product.is_selected
    join public.product_ingredients recipe on recipe.product_id = package_product.product_id
    where line.package_id is not null
      and not exists (
        select 1 from public.order_bom_requirements requirement
        where requirement.order_line_id = line.id
      )
      and not exists (
        select 1 from public.order_package_choice_snapshots choice
        where choice.order_line_id = line.id
      )
      and recipe.ingredient_id is not null
    group by line.catering_order_id, recipe.ingredient_id
  ), order_demand as (
    select demand.order_id, demand.item_id,
      timing.service_at,
      sum(demand.required_stock)::numeric as required_stock
    from (
      select * from snapshot_demand
      union all select * from direct_product_demand
      union all select * from package_base_demand
      union all select * from selected_product_demand
      union all select * from default_package_product_demand
    ) demand
    join (
      select catering_order_id, min(effective_delivery_at) as service_at
      from live_lines group by catering_order_id
    ) timing on timing.catering_order_id = demand.order_id
    group by demand.order_id, demand.item_id, timing.service_at
  ), allocated_demand as (
    select demand.*,
      sum(demand.required_stock) over (
        partition by demand.item_id
        order by demand.service_at, demand.order_id
        rows between unbounded preceding and current row
      )::numeric as cumulative_required
    from order_demand demand
  ), shortages as (
    select * from public.inventory_forecast_shortages(p_start_date, p_days)
    where source_type = 'ingredient'
  ), shortage_by_order as (
    select demand.order_id,
      jsonb_agg(jsonb_build_object(
        'itemId', shortage.item_id,
        'sku', shortage.sku,
        'name', shortage.item_name,
        'unit', shortage.unit,
        'warehouse', shortage.warehouse,
        'orderRequired', demand.required_stock,
        'totalRequired', shortage.required_stock,
        'currentStock', shortage.current_stock,
        'shortageQuantity', case when shortage.current_stock is null
          then demand.required_stock
          else greatest(demand.cumulative_required - shortage.current_stock, 0) end,
        'stockStatus', shortage.stock_status
      ) order by shortage.warehouse, shortage.item_name) as shortage_items
    from allocated_demand demand
    join shortages shortage on shortage.item_id = demand.item_id
    where shortage.current_stock is null
       or demand.cumulative_required > shortage.current_stock
    group by demand.order_id
  ), unmapped_by_order as (
    select line.catering_order_id as order_id, count(*)::bigint as unmapped_line_count
    from live_lines line
    where (line.product_id is not null or line.package_id is not null)
      and not exists (
        select 1 from public.order_bom_requirements requirement
        where requirement.order_line_id = line.id and requirement.ingredient_id is not null
      )
      and not exists (
        select 1 from public.product_ingredients recipe
        where recipe.product_id = line.product_id and recipe.ingredient_id is not null
      )
      and not exists (
        select 1 from public.product_ingredients recipe
        where recipe.package_id = line.package_id and recipe.ingredient_id is not null
      )
      and not exists (
        select 1
        from public.order_package_choice_snapshots choice
        join public.package_products package_product on package_product.id = choice.package_product_id
        join public.product_ingredients recipe on recipe.product_id = package_product.product_id
        where choice.order_line_id = line.id and choice.is_selected
          and recipe.ingredient_id is not null
      )
    group by line.catering_order_id
  ), affected_orders as (
    select order_id from shortage_by_order
    union
    select order_id from unmapped_by_order
  )
  select affected.order_id,
    coalesce(shortage.shortage_items, '[]'::jsonb),
    coalesce(unmapped.unmapped_line_count, 0)
  from affected_orders affected
  left join shortage_by_order shortage on shortage.order_id = affected.order_id
  left join unmapped_by_order unmapped on unmapped.order_id = affected.order_id;
$$;

revoke all on function public.inventory_forecast_order_shortages(date, integer)
  from public, anon, authenticated;
grant execute on function public.inventory_forecast_order_shortages(date, integer)
  to service_role;

create or replace function public.refresh_order_readiness_issues(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_today date := (p_now at time zone 'Asia/Hong_Kong')::date;
  v_end_date date := v_today + 14;
  v_shortage_notifications_enabled boolean :=
    private.inventory_shortage_notifications_enabled();
  v_count integer;
begin
  if extract(hour from p_now at time zone 'Asia/Hong_Kong') < 9
    or exists (
      select 1 from public.order_reconciliation_runs run
      where run.run_date = v_today
    )
  then
    return jsonb_build_object(
      'openReadinessIssues', null,
      'forecastDays', 14,
      'skipped', true
    );
  end if;

  -- Missing delivery date cannot be horizon-filtered, so inspect every active
  -- formal FCCD order. Shopify shadow rows are covered by missing_fccd instead.
  insert into public.order_reconciliation_issues as issue (
    issue_type, order_id, shopify_store_id, shopify_order_id,
    severity, service_at, status, last_checked_at, resolved_at, metadata
  )
  select 'missing_delivery_date', orders.id, orders.shopify_store_id,
    orders.shopify_order_id, 'important', null, 'open', p_now, null,
    jsonb_build_object('orderNumber', orders.order_number)
  from public.orders orders
  where orders.document_type = 'order'
    and orders.archived_at is null
    and orders.merged_into_order_id is null
    and orders.source_system is distinct from 'shopify'
    and orders.delivery_at is null
    and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
  on conflict (issue_type, order_id) do update
  set status = 'open', last_checked_at = p_now, resolved_at = null,
      metadata = issue.metadata || excluded.metadata;

  update public.order_reconciliation_issues issue
  set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
  where issue.issue_type = 'missing_delivery_date' and issue.status = 'open'
    and not exists (
      select 1 from public.orders orders
      where orders.id = issue.order_id and orders.document_type = 'order'
        and orders.archived_at is null and orders.merged_into_order_id is null
        and orders.source_system is distinct from 'shopify'
        and orders.delivery_at is null
        and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
    );

  -- A sent order is visible on the kitchen board only when a delivery row for
  -- the same Hong Kong delivery date exists; the board itself is delivery-led.
  insert into public.order_reconciliation_issues as issue (
    issue_type, order_id, shopify_store_id, shopify_order_id,
    severity, service_at, status, last_checked_at, resolved_at, metadata
  )
  select 'kitchen_not_visible', orders.id, orders.shopify_store_id,
    orders.shopify_order_id, 'important', orders.delivery_at, 'open', p_now, null,
    jsonb_build_object('orderNumber', orders.order_number)
  from public.orders orders
  where orders.document_type = 'order'
    and orders.archived_at is null
    and orders.merged_into_order_id is null
    and orders.source_system is distinct from 'shopify'
    and coalesce(orders.is_sent_to_factory, false)
    and not coalesce(orders.do_not_send_to_factory, false)
    and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date >= v_today
    and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date < v_end_date
    and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
    and not exists (
      select 1 from public.deliveries delivery
      where delivery.order_id = orders.id
        and delivery.delivery_at is not null
        and (delivery.delivery_at at time zone 'Asia/Hong_Kong')::date =
          (orders.delivery_at at time zone 'Asia/Hong_Kong')::date
    )
  on conflict (issue_type, order_id) do update
  set service_at = excluded.service_at, status = 'open',
      last_checked_at = p_now, resolved_at = null,
      metadata = issue.metadata || excluded.metadata;

  update public.order_reconciliation_issues issue
  set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
  where issue.issue_type = 'kitchen_not_visible' and issue.status = 'open'
    and not exists (
      select 1 from public.orders orders
      where orders.id = issue.order_id and orders.document_type = 'order'
        and orders.archived_at is null and orders.merged_into_order_id is null
        and orders.source_system is distinct from 'shopify'
        and coalesce(orders.is_sent_to_factory, false)
        and not coalesce(orders.do_not_send_to_factory, false)
        and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date >= v_today
        and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date < v_end_date
        and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
        and not exists (
          select 1 from public.deliveries delivery
          where delivery.order_id = orders.id and delivery.delivery_at is not null
            and (delivery.delivery_at at time zone 'Asia/Hong_Kong')::date =
              (orders.delivery_at at time zone 'Asia/Hong_Kong')::date
        )
    );

  -- Pickup methods do not require a driver. For delivery methods, motorcade_id
  -- is the operations assignment used by the delivery and driver panels.
  insert into public.order_reconciliation_issues as issue (
    issue_type, order_id, shopify_store_id, shopify_order_id,
    severity, service_at, status, last_checked_at, resolved_at, metadata
  )
  select 'driver_unassigned', orders.id, orders.shopify_store_id,
    orders.shopify_order_id, 'important', orders.delivery_at, 'open', p_now, null,
    jsonb_build_object('orderNumber', orders.order_number)
  from public.orders orders
  join public.deliveries delivery on delivery.order_id = orders.id
  left join public.shipping_methods method
    on method.id = coalesce(delivery.shipping_method_id, orders.shipping_method_id)
  where orders.document_type = 'order'
    and orders.archived_at is null
    and orders.merged_into_order_id is null
    and orders.source_system is distinct from 'shopify'
    and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date >= v_today
    and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date < v_end_date
    and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
    and coalesce(delivery.delivery_status, '') !~* '(cancel|取消)'
    and coalesce(method.requires_address_check, true)
    and concat_ws(' ', method.name, method.display_name) !~* '(pickup|自取)'
    and delivery.motorcade_id is null
  on conflict (issue_type, order_id) do update
  set service_at = excluded.service_at, status = 'open',
      last_checked_at = p_now, resolved_at = null,
      metadata = issue.metadata || excluded.metadata;

  update public.order_reconciliation_issues issue
  set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
  where issue.issue_type = 'driver_unassigned' and issue.status = 'open'
    and not exists (
      select 1
      from public.orders orders
      join public.deliveries delivery on delivery.order_id = orders.id
      left join public.shipping_methods method
        on method.id = coalesce(delivery.shipping_method_id, orders.shipping_method_id)
      where orders.id = issue.order_id and orders.document_type = 'order'
        and orders.archived_at is null and orders.merged_into_order_id is null
        and orders.source_system is distinct from 'shopify'
        and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date >= v_today
        and (orders.delivery_at at time zone 'Asia/Hong_Kong')::date < v_end_date
        and coalesce(orders.delivery_status, '') !~* '(cancel|取消)'
        and coalesce(delivery.delivery_status, '') !~* '(cancel|取消)'
        and coalesce(method.requires_address_check, true)
        and concat_ws(' ', method.name, method.display_name) !~* '(pickup|自取)'
        and delivery.motorcade_id is null
    );

  if v_shortage_notifications_enabled then
    insert into public.order_reconciliation_issues as issue (
      issue_type, order_id, severity, service_at, status,
      last_checked_at, resolved_at, metadata
    )
    select 'insufficient_stock', risk.order_id, 'important', orders.delivery_at,
      'open', p_now, null,
      jsonb_build_object(
        'orderNumber', orders.order_number,
        'shortageItems', risk.shortage_items,
        'unmappedLineCount', risk.unmapped_line_count,
        'forecastDays', 14
      )
    from public.inventory_forecast_order_shortages(v_today, 14) risk
    join public.orders orders on orders.id = risk.order_id
    on conflict (issue_type, order_id) do update
    set service_at = excluded.service_at, status = 'open',
        last_checked_at = p_now, resolved_at = null,
        metadata = excluded.metadata;

    update public.order_reconciliation_issues issue
    set status = 'resolved', resolved_at = p_now, last_checked_at = p_now
    where issue.issue_type = 'insufficient_stock' and issue.status = 'open'
      and not exists (
        select 1 from public.inventory_forecast_order_shortages(v_today, 14) risk
        where risk.order_id = issue.order_id
      );
  else
    update public.order_reconciliation_issues issue
    set status = 'resolved', resolved_at = p_now, last_checked_at = p_now,
        metadata = issue.metadata || jsonb_build_object(
          'resolutionReason', 'shortage_notifications_disabled'
        )
    where issue.issue_type = 'insufficient_stock' and issue.status = 'open';
  end if;

  select count(*) into v_count
  from public.order_reconciliation_issues
  where status = 'open'
    and issue_type in (
      'missing_delivery_date', 'kitchen_not_visible',
      'driver_unassigned', 'insufficient_stock'
    );

  return jsonb_build_object('openReadinessIssues', v_count, 'forecastDays', 14);
end;
$$;

revoke all on function public.refresh_order_readiness_issues(timestamptz)
  from public, anon, authenticated;
grant execute on function public.refresh_order_readiness_issues(timestamptz)
  to service_role;

-- Keep one daily WhatsApp per order. The worker loads and summarizes every
-- open issue for the selected order, so one order with several problems still
-- produces only one message.
create or replace function private.enqueue_order_reconciliation_alerts(
  p_now timestamptz,
  p_daily boolean
)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_date_key text := (p_now at time zone 'Asia/Hong_Kong')::date::text;
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  if p_daily then
    insert into public.order_reconciliation_alert_outbox (
      issue_id, order_id, event_key, cycle_key, channel,
      recipient_key, recipient_name, recipient_address
    )
    select null, null, 'daily_reconciliation', v_date_key, 'email',
      recipient.recipient_key, recipient.recipient_name, recipient.recipient_address
    from private.order_email_notification_recipients() recipient
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;

    if exists (
      select 1 from public.order_reconciliation_issues issue
      where issue.status = 'open'
        and (issue.issue_type <> 'insufficient_stock'
          or private.inventory_shortage_notifications_enabled())
    ) then
      insert into public.order_reconciliation_alert_outbox (
        issue_id, order_id, event_key, cycle_key, channel,
        recipient_key, recipient_name, recipient_address
      )
      select selected.issue_id, selected.order_id,
        'daily_reconciliation', v_date_key, 'whatsapp',
        selected.recipient_key, selected.recipient_name, selected.recipient_address
      from (
        select distinct on (issue.order_id, recipient.id)
          issue.id as issue_id, issue.order_id,
          recipient.id::text as recipient_key,
          recipient.name as recipient_name,
          recipient.phone as recipient_address
        from public.order_reconciliation_issues issue
        cross join public.order_first_notification_recipients recipient
        where issue.status = 'open'
          and (issue.issue_type <> 'insufficient_stock'
            or private.inventory_shortage_notifications_enabled())
        order by issue.order_id, recipient.id,
          case issue.issue_type
            when 'missing_fccd' then 0
            when 'unlinked_fccd' then 1
            when 'missing_delivery_date' then 2
            when 'factory_unsent' then 3
            when 'kitchen_not_visible' then 4
            when 'driver_unassigned' then 5
            when 'insufficient_stock' then 6
            else 7
          end,
          issue.service_at nulls last, issue.id
      ) selected
      on conflict do nothing;
    else
      insert into public.order_reconciliation_alert_outbox (
        issue_id, order_id, event_key, cycle_key, channel,
        recipient_key, recipient_name, recipient_address
      )
      select null, null, 'daily_reconciliation', v_date_key, 'whatsapp',
        recipient.id::text, recipient.name, recipient.phone
      from public.order_first_notification_recipients recipient
      on conflict do nothing;
    end if;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end if;

  insert into public.order_reconciliation_alert_outbox (
    issue_id, order_id, event_key, cycle_key, channel,
    recipient_key, recipient_name, recipient_address
  )
  select issue.id, issue.order_id,
    case when issue.first_detected_at >= p_now - interval '10 minutes'
      then 'late_order_immediate' else 'six_hour_reconciliation' end,
    'urgent', 'email', recipient.recipient_key,
    recipient.recipient_name, recipient.recipient_address
  from public.order_reconciliation_issues issue
  cross join private.order_email_notification_recipients() recipient
  where issue.status = 'open' and issue.severity = 'urgent'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  insert into public.order_reconciliation_alert_outbox (
    issue_id, order_id, event_key, cycle_key, channel,
    recipient_key, recipient_name, recipient_address
  )
  select issue.id, issue.order_id,
    case when issue.first_detected_at >= p_now - interval '10 minutes'
      then 'late_order_immediate' else 'six_hour_reconciliation' end,
    'urgent', 'whatsapp', recipient.id::text, recipient.name, recipient.phone
  from public.order_reconciliation_issues issue
  cross join public.order_first_notification_recipients recipient
  where issue.status = 'open' and issue.severity = 'urgent'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_inserted + v_rows;
end;
$$;

comment on function public.refresh_order_readiness_issues(timestamptz) is
  'Checks active formal orders for missing delivery date, kitchen-board visibility, driver assignment, and 14-day ingredient/packing shortages.';
