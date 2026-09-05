begin;

insert into public.customer_service_intents (
  intent_key, display_name, description, examples, action_key,
  enabled, priority, confidence_threshold
) values (
  'browse_menu',
  '索取餐牌',
  '客人要求查看餐牌、菜單或各品牌落單連結。只讀取後台已發布的餐牌 FAQ，不建立訂餐或人工跟進。',
  array['有冇餐牌可以睇','有菜單嗎','我想訂餐，想先看看菜單','send me the menu'],
  'faq_search', true, 25, 0.50
)
on conflict (intent_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  examples = excluded.examples,
  action_key = excluded.action_key,
  enabled = excluded.enabled,
  priority = excluded.priority,
  confidence_threshold = excluded.confidence_threshold,
  updated_at = now();

insert into public.customer_service_tool_permissions (
  intent_key, tool_key, allowed, requires_human
) values ('browse_menu', 'search_faqs', true, false)
on conflict (intent_key, tool_key) do update set
  allowed = excluded.allowed,
  requires_human = excluded.requires_human;

alter table public.customer_service_turns
  add column if not exists classification_confidence numeric(5,4)
    check (classification_confidence is null or classification_confidence between 0 and 1),
  add column if not exists auto_outcome text
    check (auto_outcome is null or auto_outcome in ('success', 'failure', 'needs_review')),
  add column if not exists auto_score numeric(5,4)
    check (auto_score is null or auto_score between 0 and 1),
  add column if not exists auto_dimensions jsonb not null default '{}'::jsonb,
  add column if not exists auto_reason text,
  add column if not exists auto_evaluated_at timestamptz;

create index if not exists customer_service_turns_auto_outcome_idx
  on public.customer_service_turns (environment, auto_outcome, created_at desc);

create table if not exists public.customer_service_conversation_mode_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production',
  phone_normalized text not null,
  provider_message_id text unique,
  source text not null check (source in ('backend', 'wati_operator', 'system')),
  from_state text,
  to_state text not null,
  mode text not null check (mode in ('human', 'bot')),
  reason text,
  last_human_message text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists customer_service_mode_events_phone_idx
  on public.customer_service_conversation_mode_events
  (phone_normalized, created_at desc);

alter table public.customer_service_conversation_mode_events enable row level security;
revoke all on table public.customer_service_conversation_mode_events from public, anon, authenticated;
grant all on table public.customer_service_conversation_mode_events to service_role;

create or replace function public.customer_service_conversation_mode_events_list(
  p_phone text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  environment text,
  phone_normalized text,
  source text,
  from_state text,
  to_state text,
  mode text,
  reason text,
  last_human_message text,
  actor_id uuid,
  actor_name text,
  actor_email text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, private
as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select event.id, event.environment, event.phone_normalized, event.source,
      event.from_state, event.to_state, event.mode, event.reason,
      event.last_human_message, event.actor_id, event.actor_name,
      event.actor_email, event.created_at
    from public.customer_service_conversation_mode_events event
    where v_phone = '' or event.phone_normalized = v_phone
    order by event.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.customer_service_conversation_set_mode(
  p_phone text,
  p_mode text
)
returns text language plpgsql security definer set search_path = public, private
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_from_state text;
  v_environment text;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if v_phone = '' or p_mode not in ('human', 'bot') then
    raise exception 'invalid_conversation_mode' using errcode = '22023';
  end if;

  select conversation.state into v_from_state
  from public.customer_service_conversations conversation
  where conversation.phone_normalized = v_phone
  for update;

  select request.environment into v_environment
  from public.customer_service_handoff_requests request
  where request.phone_normalized = v_phone
  order by request.created_at desc limit 1;

  insert into public.customer_service_conversations(
    phone_normalized, state, selected_order_id, handoff_at, pending_request,
    active_goal, workflow_slots, suspended_goals, updated_at
  ) values (
    v_phone, case when p_mode = 'human' then 'human_owned' else 'identifying' end,
    null, case when p_mode = 'human' then now() else null end, null,
    null, '{}'::jsonb, '[]'::jsonb, now()
  ) on conflict (phone_normalized) do update set
    state = excluded.state, selected_order_id = null, handoff_at = excluded.handoff_at,
    pending_request = null, active_goal = null, workflow_slots = '{}'::jsonb,
    suspended_goals = '[]'::jsonb, identity_verified_at = null,
    identity_verification_method = null, identity_verification_order_id = null,
    identity_verification_attempts = 0, updated_at = now();

  if p_mode = 'human' then
    update public.customer_service_handoff_requests set status = 'in_progress',
      claimed_at = now(), claimed_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone
      and status in ('pending','processing','notified','failed');
  else
    update public.customer_service_handoff_requests set status = 'resolved',
      resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
    where phone_normalized = v_phone
      and status in ('pending','processing','notified','in_progress','failed');
  end if;

  insert into public.customer_service_conversation_mode_events(
    environment, phone_normalized, source, from_state, to_state,
    mode, reason, actor_id
  ) values (
    coalesce(v_environment, 'production'), v_phone, 'backend', v_from_state,
    case when p_mode = 'human' then 'human_owned' else 'identifying' end,
    p_mode,
    case when p_mode = 'human' then '後台手動真人接手' else '後台手動交回機器人' end,
    auth.uid()
  );
  return p_mode;
end;
$$;

drop function if exists public.customer_service_lookup_order_items(text, uuid);
create function public.customer_service_lookup_order_items(p_phone text, p_order_id uuid)
returns table (
  order_line_id uuid,
  package_name text,
  item_kind text,
  item_name text,
  item_content text,
  quantity numeric,
  quantity_text text,
  remarks text[]
)
language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare v_phone text := private.self_service_phone(p_phone);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if length(coalesce(v_phone, '')) < 8 or p_order_id is null then return; end if;
  if not exists (
    select 1 from public.orders
    where orders.id = p_order_id and orders.document_type = 'order'
      and orders.archived_at is null
      and (private.self_service_phone(orders.contact_number_a_snapshot) = v_phone
        or private.self_service_phone(orders.contact_number_b_snapshot) = v_phone)
  ) then return; end if;

  return query
  select line.id,
    coalesce(nullif(btrim(package.chinese_name), ''), nullif(btrim(package.name), '')),
    case
      when concat_ws(' ', line.product_name_snapshot, line.content_snapshot, product.name)
        ~* '(餐具|刀叉|紙碟|膠碟|紙杯|餐巾|napkin|cutlery|utensil)' then 'utensil'
      when line.package_id is not null and line.product_id is null then 'package'
      when line.package_id is not null then 'package_item'
      else 'item'
    end,
    coalesce(nullif(btrim(line.product_name_snapshot), ''), nullif(btrim(product.name), ''),
      nullif(btrim(line.content_snapshot), ''), nullif(btrim(line.sku_snapshot), ''), '未命名菜式'),
    case when nullif(btrim(line.content_snapshot), '') is distinct from coalesce(
      nullif(btrim(line.product_name_snapshot), ''), nullif(btrim(product.name), '')
    ) then nullif(btrim(line.content_snapshot), '') else null end,
    line.quantity, nullif(btrim(line.new_quantity_text), ''),
    coalesce(nullif(line.label_remarks, '{}'::text[]),
      array_remove(array[line.remarks_1, line.remarks_2], null), '{}'::text[])
  from public.order_lines line
  left join public.packages package on package.id = line.package_id
  left join public.products product on product.id = line.product_id
  where line.order_id = p_order_id and not line.is_void
    and (coalesce(line.quantity, 0) <> 0 or nullif(btrim(line.new_quantity_text), '') is not null)
  order by package.name nulls last, line.item_order nulls last, line.created_at, line.id;
end;
$$;

create or replace function public.customer_service_config_release(p_id uuid, p_action text default 'activate')
returns uuid language plpgsql security definer set search_path = public, private
as $$
declare
  v_environment text;
  v_current uuid;
  v_run public.customer_service_evaluation_runs%rowtype;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_action not in ('activate', 'rollback') then
    raise exception 'invalid_release_action' using errcode = '22023';
  end if;
  select environment into v_environment from public.customer_service_config_versions
    where id = p_id for update;
  if not found then raise exception 'config_not_found' using errcode = 'P0002'; end if;
  select id into v_current from public.customer_service_config_versions
    where environment = v_environment and status = 'active' for update;
  if v_current = p_id then return p_id; end if;

  if p_action = 'activate' then
    select * into v_run from public.customer_service_evaluation_runs run
    where run.candidate_config_id = p_id and run.status = 'complete'
    order by run.completed_at desc nulls last, run.created_at desc limit 1;
    if not found then
      raise exception 'completed_evaluation_required' using errcode = '55000';
    end if;
    if v_run.sample_size < 5
      or coalesce((v_run.metrics->>'agreement_rate')::numeric, 0) < 0.80
      or (v_run.metrics ? 'intent_accuracy' and (v_run.metrics->>'intent_accuracy') is not null
        and (v_run.metrics->>'intent_accuracy')::numeric < 0.80)
      or (v_run.metrics ? 'tool_accuracy' and (v_run.metrics->>'tool_accuracy') is not null
        and (v_run.metrics->>'tool_accuracy')::numeric < 0.80)
      or (v_run.metrics ? 'dialog_action_accuracy' and (v_run.metrics->>'dialog_action_accuracy') is not null
        and (v_run.metrics->>'dialog_action_accuracy')::numeric < 0.80)
      or coalesce((v_run.comparison->>'agreement_rate_delta')::numeric, 0) < -0.05
    then
      raise exception 'evaluation_quality_gate_failed' using errcode = '55000';
    end if;
  elsif not exists (
    select 1 from public.customer_service_config_release_events event where event.to_config_id = p_id
  ) then
    raise exception 'previous_release_required' using errcode = '55000';
  end if;

  update public.customer_service_config_versions set status = 'archived', updated_at = now()
    where environment = v_environment and status = 'active';
  update public.customer_service_config_versions set status = 'active', activated_by = auth.uid(),
    activated_at = now(), updated_at = now() where id = p_id;
  insert into public.customer_service_config_release_events(
    environment, action, from_config_id, to_config_id, actor_id
  ) values (v_environment, p_action, v_current, p_id, auth.uid());
  return p_id;
end;
$$;

revoke all on function public.customer_service_conversation_mode_events_list(text, integer) from public, anon;
grant execute on function public.customer_service_conversation_mode_events_list(text, integer) to authenticated;
revoke all on function public.customer_service_lookup_order_items(text, uuid) from public, anon, authenticated;
grant execute on function public.customer_service_lookup_order_items(text, uuid) to service_role;
revoke all on function public.customer_service_config_release(uuid, text) from public, anon;
grant execute on function public.customer_service_config_release(uuid, text) to authenticated;

comment on table public.customer_service_conversation_mode_events is
  'Audits every backend or WATI transition between human-owned and bot-owned customer conversations.';
comment on function public.customer_service_lookup_order_items(text, uuid) is
  'Returns verified order items with package, child-item, utensil and standalone-item classification.';

commit;
