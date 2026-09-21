-- FCCD R2 政策／意圖 runtime 修改（HR-09）：修復提案可產生結構化 patch，經人審後由
-- allow-list 執行器套用至 live 的 intents／workflow_policies／reply_templates。
--
-- 與學習建議的執行器（20260915143000_customer_service_learning_safety.sql）用同一套
-- allow-list，分別只在於這裡的 patch 存在 repair proposal 上，且永不自動套用。
-- 執行器只授予 service_role：呼叫必須經 customer-service-history-replay 邊緣函式，
-- 由該函式驗證登入者具 settings.customer_faq.edit 權限後才呼叫。
begin;
set local search_path = public, extensions, pg_temp;

alter table public.customer_service_repair_proposals
  add column if not exists runtime_change_draft jsonb not null default '{}'::jsonb
    check (jsonb_typeof(runtime_change_draft) = 'object'),
  add column if not exists runtime_change_drafted_at timestamptz,
  add column if not exists runtime_change_applied_at timestamptz,
  add column if not exists runtime_change_result jsonb,
  add column if not exists runtime_change_rollback jsonb;

create or replace function public.customer_service_repair_runtime_change_review(
  p_proposal_id uuid, p_environment text, p_actor uuid, p_decision text
)
returns table (proposal_id uuid, proposal_status text, change_count integer)
language plpgsql security definer set search_path = public, private as $$
declare
  v_proposal public.customer_service_repair_proposals%rowtype;
  v_changes jsonb;
  v_change jsonb;
  v_patch jsonb;
  v_target text;
  v_key text;
  v_examples text[];
  v_prior jsonb;
  v_row_count integer;
  v_applied integer := 0;
  v_rollback jsonb := '[]'::jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  if p_decision is null or p_decision not in ('apply', 'reject') then
    raise exception 'invalid_runtime_change_decision' using errcode = '22023';
  end if;
  if p_decision = 'apply' and p_actor is null then
    raise exception 'reviewer_required' using errcode = '42501';
  end if;

  select proposals.* into v_proposal
  from public.customer_service_repair_proposals proposals
  where proposals.id = p_proposal_id
  for update;
  if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
  if v_proposal.environment <> p_environment then
    raise exception 'environment_mismatch' using errcode = '22023';
  end if;
  if v_proposal.repair_kind <> 'runtime_policy_candidate' or v_proposal.risk_level <> 'R2' then
    raise exception 'not_a_runtime_change_proposal' using errcode = '22023';
  end if;
  if v_proposal.status <> 'drafted' then
    raise exception 'proposal_not_drafted' using errcode = '55000';
  end if;

  if p_decision = 'reject' then
    update public.customer_service_repair_proposals proposals
    set status = 'rejected',
      runtime_change_result = jsonb_build_object('review', 'rejected'),
      approved_by = p_actor, approved_at = now(), updated_at = now()
    where proposals.id = p_proposal_id;
    return query select p_proposal_id, 'rejected'::text, 0;
    return;
  end if;

  v_changes := v_proposal.runtime_change_draft->'changes';
  if v_changes is null
     or jsonb_typeof(v_changes) <> 'array'
     or jsonb_array_length(v_changes) = 0 then
    raise exception 'runtime_change_mapping_required' using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(v_changes)
  loop
    v_target := btrim(coalesce(v_change->>'target', ''));
    v_key := btrim(coalesce(v_change->>'key', ''));
    v_patch := v_change->'patch';
    if v_key = '' or v_patch is null or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
      raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
    end if;

    if v_target = 'intent' then
      if btrim(coalesce(v_patch->>'description_append', '')) = ''
         and coalesce(v_patch->'examples_append', '[]'::jsonb) = '[]'::jsonb then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      if v_patch - array['description_append', 'examples_append']::text[] <> '{}'::jsonb
         or (v_patch ? 'examples_append' and jsonb_typeof(v_patch->'examples_append') <> 'array') then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      select coalesce(array_agg(value), '{}'::text[]) into v_examples
      from jsonb_array_elements_text(coalesce(v_patch->'examples_append', '[]'::jsonb));
      if btrim(coalesce(v_patch->>'description_append', '')) = ''
         and not exists (select 1 from unnest(v_examples) example where btrim(example) <> '') then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      select jsonb_build_object('description', intents.description, 'examples', intents.examples)
        into v_prior
      from public.customer_service_intents intents
      where intents.intent_key = v_key
      for update;
      if v_prior is null then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      update public.customer_service_intents intents
      set description = case
            when btrim(coalesce(v_patch->>'description_append', '')) = ''
              or strpos(intents.description, btrim(v_patch->>'description_append')) > 0
            then intents.description
            else intents.description || ' ' || btrim(v_patch->>'description_append')
          end,
          examples = array(
            select distinct example
            from unnest(intents.examples || coalesce(v_examples, '{}'::text[])) example
            where btrim(example) <> '' order by example
          ),
          updated_by = p_actor, updated_at = now()
      where intents.intent_key = v_key;
    elsif v_target = 'reply_template' then
      if v_patch - array['display_name', 'content', 'enabled']::text[] <> '{}'::jsonb
         or btrim(coalesce(v_patch->>'content', '')) = '' then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      select jsonb_build_object('display_name', templates.display_name, 'content', templates.content,
          'enabled', templates.enabled)
        into v_prior
      from public.customer_service_reply_templates templates
      where templates.template_key = v_key
      for update;
      insert into public.customer_service_reply_templates(
        template_key, display_name, content, enabled, updated_by, updated_at
      ) values (
        v_key, coalesce(nullif(btrim(v_patch->>'display_name'), ''), v_key),
        btrim(v_patch->>'content'), coalesce((v_patch->>'enabled')::boolean, true),
        p_actor, now()
      ) on conflict (template_key) do update set
        display_name = excluded.display_name, content = excluded.content,
        enabled = excluded.enabled, updated_by = p_actor, updated_at = now();
    elsif v_target = 'workflow_policy' then
      if btrim(coalesce(v_patch->>'instructions_append', '')) = ''
         and not exists (
           select 1 from jsonb_each(v_patch) entry
           where entry.key <> 'instructions_append' and entry.value <> 'null'::jsonb
         ) then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      if v_patch - array['instructions_append', 'context_window', 'clarification_threshold', 'auto_resume', 'enabled']::text[] <> '{}'::jsonb then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      select jsonb_build_object('instructions', policies.instructions, 'context_window', policies.context_window,
          'clarification_threshold', policies.clarification_threshold, 'auto_resume', policies.auto_resume,
          'enabled', policies.enabled)
        into v_prior
      from public.customer_service_workflow_policies policies
      where policies.goal_key = v_key
      for update;
      if v_prior is null then
        raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
      end if;
      update public.customer_service_workflow_policies policies
      set instructions = case
            when btrim(coalesce(v_patch->>'instructions_append', '')) = ''
              or strpos(policies.instructions, btrim(v_patch->>'instructions_append')) > 0
            then policies.instructions
            else policies.instructions || ' ' || btrim(v_patch->>'instructions_append')
          end,
          context_window = coalesce((v_patch->>'context_window')::integer, policies.context_window),
          clarification_threshold = coalesce((v_patch->>'clarification_threshold')::numeric, policies.clarification_threshold),
          auto_resume = coalesce((v_patch->>'auto_resume')::boolean, policies.auto_resume),
          enabled = coalesce((v_patch->>'enabled')::boolean, policies.enabled),
          updated_by = p_actor, updated_at = now()
      where policies.goal_key = v_key;
    else
      raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
    end if;

    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
    end if;
    v_applied := v_applied + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('target', v_target, 'key', v_key));
    v_rollback := v_rollback || jsonb_build_array(jsonb_build_object(
      'target', v_target, 'key', v_key, 'before', coalesce(v_prior, 'null'::jsonb)));
  end loop;

  if v_applied <> jsonb_array_length(v_changes) then
    raise exception 'runtime_change_mapping_invalid' using errcode = '22023';
  end if;

  update public.customer_service_repair_proposals proposals
  set status = 'applied',
    runtime_change_applied_at = now(),
    runtime_change_result = jsonb_build_object('change_count', v_applied, 'changes', v_result),
    runtime_change_rollback = v_rollback,
    approved_by = p_actor, approved_at = now(),
    executed_by = coalesce(proposals.executed_by, 'history-replay-runtime'),
    executed_at = now(), updated_at = now()
  where proposals.id = p_proposal_id;

  return query select p_proposal_id, 'applied'::text, v_applied;
end;
$$;

-- Internal RPC: only the edge function (service_role) may call it after checking
-- the caller's page access. It is deliberately not exposed to end users.
revoke all on function public.customer_service_repair_runtime_change_review(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.customer_service_repair_runtime_change_review(uuid, text, uuid, text)
  to service_role;

commit;
