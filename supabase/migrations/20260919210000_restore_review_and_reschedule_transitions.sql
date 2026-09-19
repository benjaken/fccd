-- Repair transitions introduced earlier today. Keep this migration additive so
-- databases that have already applied the original migrations receive the fix.
begin;

create or replace function public.customer_service_cases_before_write()
returns trigger language plpgsql
set search_path = pg_catalog, public, extensions, pg_temp as $$
declare
  v_content_changed boolean := false;
begin
  new.updated_at := clock_timestamp();
  if TG_OP = 'INSERT' then
    new.revision := 1;
    new.embedding_revision := 1;
    new.embedding_status := 'pending';
    new.content_hash := null;
    if new.status <> 'draft' then
      raise exception 'customer_service_case_must_start_draft' using errcode = '22023';
    end if;
  elsif new.title is distinct from old.title
     or new.scenario_context is distinct from old.scenario_context
     or new.known_information is distinct from old.known_information
     or new.missing_information is distinct from old.missing_information
     or new.conversation_excerpt is distinct from old.conversation_excerpt
     or new.response_strategy is distinct from old.response_strategy
     or new.applicability is distinct from old.applicability
     or new.environment is distinct from old.environment then
    v_content_changed := true;
    new.revision := old.revision + 1;
    new.embedding_revision := old.embedding_revision + 1;
    new.embedding_status := 'pending';
    new.content_hash := null;
    new.embedding_profile := null;
    new.embedding_updated_at := null;
    new.embedding_claim_token := null;
    new.embedding_claim_until := null;
    new.embedding_target_profile := null;
    new.embedding_retry_at := null;
    new.embedding_attempts := 0;
    new.embedding_error := null;
    if old.status = 'active' then
      new.status := 'draft';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;

  -- 首期不變條件：合成資料不可入 production；learned_bot 不可啟用。
  if new.is_synthetic and new.environment = 'production' then
    raise exception 'customer_service_case_synthetic_production_forbidden' using errcode = '22023';
  end if;
  if new.provenance = 'learned_bot' and new.status = 'active' then
    raise exception 'customer_service_case_learned_bot_not_active' using errcode = '22023';
  end if;

  -- 狀態轉移守衛。
  if TG_OP = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'active' and new.status = 'draft' and v_content_changed then
      null; -- Editing an active case withdraws it for re-embedding and review.
    elsif old.status = 'retired' and new.status = 'draft' then
      new.retired_at := null;
      new.retired_reason := null;
    elsif new.status = 'active' then
      if old.status <> 'draft' then
        raise exception 'customer_service_case_invalid_transition' using errcode = '22023';
      end if;
      if new.embedding_status <> 'ready'
         or new.embedding_revision <> new.revision
         or new.content_hash is null
         or new.reviewed_by is null then
        raise exception 'customer_service_case_not_ready_to_activate' using errcode = '22023';
      end if;
      new.reviewed_at := coalesce(new.reviewed_at, clock_timestamp());
    elsif new.status = 'retired' then
      new.retired_at := coalesce(new.retired_at, clock_timestamp());
    else
      raise exception 'customer_service_case_invalid_transition' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.enqueue_wati_order_event(
  p_order_id uuid,
  p_event_key text,
  p_occurrence_key text
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_order public.orders%rowtype;
  v_inserted integer;
begin
  if p_event_key not in ('delivery_today_reminder', 'pickup_today_reminder') then
    return 0;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null
     or private.wati_order_is_cancelled(v_order)
     or private.wati_order_is_reschedule_pending(v_order)
  then
    return 0;
  end if;

  insert into public.wati_order_notification_outbox as outbox (
    order_id, template_id, event_key, occurrence_key
  )
  select p_order_id, template.id, template.event_key, p_occurrence_key
  from public.wati_order_notification_templates template
  where template.event_key = p_event_key
    and template.is_active
  on conflict (order_id, template_id, occurrence_key) do update set
    status = 'pending',
    wati_skipped_at = case when outbox.wati_sent_at is null then null else outbox.wati_skipped_at end,
    email_skipped_at = case when outbox.email_sent_at is null then null else outbox.email_skipped_at end,
    wati_error = null, email_error = null, last_error = null,
    locked_at = null, updated_at = clock_timestamp()
  where outbox.status = 'skipped'
    and outbox.last_error = 'order_reschedule_pending'
    and outbox.sent_at is null
    and (outbox.wati_sent_at is null or outbox.email_sent_at is null);

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

commit;
