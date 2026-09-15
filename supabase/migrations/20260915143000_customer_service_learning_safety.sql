begin;

alter table public.customer_service_learning_suggestions
  add column if not exists evidence_message_ids uuid[] not null default '{}';

drop function if exists public.customer_service_learning_suggestions_list(text, integer);
create function public.customer_service_learning_suggestions_list(
  p_status text default 'draft', p_limit integer default 50
)
returns table (
  id uuid, report_id uuid, report_date date, suggestion_type text,
  title text, reason text, proposed_content jsonb, evidence_count integer,
  status text, target_faq_id uuid, runtime_target text,
  execution_status text, execution_result jsonb, executed_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not private.has_page_access('settings.customer_faq') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return query
    select suggestions.id, suggestions.report_id, reports.report_date,
      suggestions.suggestion_type, suggestions.title, suggestions.reason,
      suggestions.proposed_content,
      coalesce(array_length(suggestions.evidence_turn_ids, 1), 0) + coalesce(array_length(suggestions.evidence_message_ids, 1), 0),
      suggestions.status, suggestions.target_faq_id,
      suggestions.runtime_target, suggestions.execution_status,
      suggestions.execution_result, suggestions.executed_at,
      suggestions.created_at
    from public.customer_service_learning_suggestions suggestions
    join public.customer_service_daily_reports reports on reports.id = suggestions.report_id
    where p_status is null or suggestions.status = p_status
    order by suggestions.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

create or replace function public.customer_service_learning_suggestion_review(p_id uuid, p_status text)
returns table (suggestion_id uuid, suggestion_status text, target_faq_id uuid)
language plpgsql security definer set search_path = public, private as $$
declare
  v_suggestion public.customer_service_learning_suggestions%rowtype;
  v_changes jsonb;
  v_change jsonb;
  v_patch jsonb;
  v_target text;
  v_key text;
  v_question text;
  v_answer text;
  v_category text;
  v_keywords text;
  v_faq_id uuid;
  v_examples text[];
  v_row_count integer;
  v_executed_count integer := 0;
  v_result jsonb := '[]'::jsonb;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'invalid_suggestion_status' using errcode = '22023';
  end if;

  select suggestions.* into v_suggestion
  from public.customer_service_learning_suggestions suggestions
  where suggestions.id = p_id for update;
  if not found then raise exception 'suggestion_not_found' using errcode = 'P0002'; end if;
  if v_suggestion.status <> 'draft' then
    raise exception 'suggestion_already_reviewed' using errcode = '55000';
  end if;

  if p_status = 'rejected' then
    update public.customer_service_learning_suggestions suggestions
    set status = 'rejected', execution_status = 'not_applicable',
      execution_result = jsonb_build_object('review', 'rejected'),
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where suggestions.id = p_id;
    return query select p_id, 'rejected'::text, v_suggestion.target_faq_id;
    return;
  end if;

  if v_suggestion.suggestion_type = 'faq' then
    v_question := btrim(coalesce(v_suggestion.proposed_content->>'question', ''));
    v_answer := btrim(coalesce(v_suggestion.proposed_content->>'answer', ''));
    v_category := btrim(coalesce(v_suggestion.proposed_content->>'category', 'ordering'));
    v_keywords := btrim(coalesce(v_suggestion.proposed_content->>'keywords', ''));
    if v_question = '' or v_answer = '' then
      raise exception 'suggestion_mapping_required' using errcode = '22023';
    end if;
    if v_category not in ('ordering', 'delivery', 'payment', 'membership', 'menu') then
      raise exception 'suggestion_mapping_invalid' using errcode = '22023';
    end if;
    insert into public.customer_faqs(category, question, answer, keywords, locale, is_published, sort_order)
    values (v_category, v_question, v_answer, v_keywords, 'zh-HK', true, 0)
    on conflict (locale, question) do nothing
    returning customer_faqs.id into v_faq_id;
    if v_faq_id is null then
      select faqs.id into v_faq_id from public.customer_faqs faqs
      where faqs.locale = 'zh-HK' and faqs.question = v_question
        and faqs.answer = v_answer and faqs.is_published for update;
      if v_faq_id is null then
        raise exception 'suggestion_faq_conflict' using errcode = '22023';
      end if;
    end if;
    v_executed_count := 1;
    v_result := jsonb_build_array(jsonb_build_object('target', 'faq', 'key', v_faq_id));
  else
    v_changes := v_suggestion.proposed_content->'runtime_changes';
    if v_changes is null
       or jsonb_typeof(v_changes) <> 'array'
       or jsonb_array_length(v_changes) = 0 then
      raise exception 'suggestion_mapping_required' using errcode = '22023';
    end if;

    for v_change in select value from jsonb_array_elements(v_changes)
    loop
      v_target := btrim(coalesce(v_change->>'target', ''));
      v_key := btrim(coalesce(v_change->>'key', ''));
      v_patch := v_change->'patch';
      if v_key = '' or v_patch is null or jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
        raise exception 'suggestion_mapping_invalid' using errcode = '22023';
      end if;

      if v_target = 'intent' then
        if btrim(coalesce(v_patch->>'description_append', '')) = ''
           and coalesce(v_patch->'examples_append', '[]'::jsonb) = '[]'::jsonb then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
        end if;
        if v_patch - array['description_append', 'examples_append']::text[] <> '{}'::jsonb
           or (v_patch ? 'examples_append' and jsonb_typeof(v_patch->'examples_append') <> 'array') then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
        end if;
        select coalesce(array_agg(value), '{}'::text[]) into v_examples
        from jsonb_array_elements_text(coalesce(v_patch->'examples_append', '[]'::jsonb));
        if btrim(coalesce(v_patch->>'description_append', '')) = ''
           and not exists (select 1 from unnest(v_examples) example where btrim(example) <> '') then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
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
            updated_by = auth.uid(), updated_at = now()
        where intents.intent_key = v_key;
      elsif v_target = 'reply_template' then
        if v_patch - array['display_name', 'content', 'enabled']::text[] <> '{}'::jsonb
           or btrim(coalesce(v_patch->>'content', '')) = '' then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
        end if;
        if not exists (select 1 from public.customer_service_reply_templates where template_key = v_key) then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
        end if;
        insert into public.customer_service_reply_templates(
          template_key, display_name, content, enabled, updated_by, updated_at
        ) values (
          v_key, coalesce(nullif(btrim(v_patch->>'display_name'), ''), v_key),
          btrim(v_patch->>'content'), coalesce((v_patch->>'enabled')::boolean, true),
          auth.uid(), now()
        ) on conflict (template_key) do update set
          display_name = excluded.display_name, content = excluded.content,
          enabled = excluded.enabled, updated_by = auth.uid(), updated_at = now();
      elsif v_target = 'workflow_policy' then
        if btrim(coalesce(v_patch->>'instructions_append', '')) = ''
           and not exists (
             select 1 from jsonb_each(v_patch) entry
             where entry.key <> 'instructions_append' and entry.value <> 'null'::jsonb
           ) then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
        end if;
        if v_patch - array['instructions_append', 'context_window', 'clarification_threshold', 'auto_resume', 'enabled']::text[] <> '{}'::jsonb then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
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
            updated_by = auth.uid(), updated_at = now()
        where policies.goal_key = v_key;
      else
        raise exception 'suggestion_mapping_invalid' using errcode = '22023';
      end if;

      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception 'suggestion_mapping_invalid' using errcode = '22023';
      end if;
      v_executed_count := v_executed_count + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('target', v_target, 'key', v_key));
    end loop;

    if v_executed_count <> jsonb_array_length(v_changes) then
      raise exception 'suggestion_mapping_invalid' using errcode = '22023';
    end if;
  end if;

  update public.customer_service_learning_suggestions suggestions
  set status = 'approved', target_faq_id = coalesce(v_faq_id, suggestions.target_faq_id),
    runtime_target = coalesce(suggestions.runtime_target,
      case when suggestions.suggestion_type = 'faq' then 'faq' else null end),
    execution_status = 'applied', execution_result = jsonb_build_object(
      'change_count', v_executed_count, 'changes', v_result
    ), executed_at = now(), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where suggestions.id = p_id;

  return query select p_id, 'approved'::text, coalesce(v_faq_id, v_suggestion.target_faq_id);
end;
$$;

revoke all on function public.customer_service_learning_suggestions_list(text, integer) from public, anon;
revoke all on function public.customer_service_learning_suggestion_review(uuid, text) from public, anon;
grant execute on function public.customer_service_learning_suggestions_list(text, integer) to authenticated;
grant execute on function public.customer_service_learning_suggestion_review(uuid, text) to authenticated;

-- Serialize report reruns and FAQ merges. Publishing and its audit record share
-- one transaction; a failed write cannot leave a live, unrecorded alias.
create or replace function public.customer_service_learning_suggestion_store(
  p_report_id uuid, p_suggestion jsonb
)
returns uuid
language plpgsql security definer set search_path = public, private as $$
declare
  v_id uuid;
  v_type text := p_suggestion->>'suggestion_type';
  v_content jsonb := p_suggestion->'proposed_content';
  v_question text := btrim(coalesce(v_content->>'question', ''));
  v_answer text := btrim(coalesce(v_content->>'answer', ''));
  v_turns uuid[];
  v_messages uuid[];
  v_faq public.customer_faqs%rowtype;
begin
  if v_type is null or v_type not in ('faq', 'intent', 'policy')
     or v_content is null or jsonb_typeof(v_content) <> 'object'
     or btrim(coalesce(p_suggestion->>'title', '')) = '' then
    raise exception 'invalid_learning_suggestion' using errcode = '22023';
  end if;
  perform 1 from public.customer_service_daily_reports where id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select id into v_id from public.customer_service_learning_suggestions
  where report_id = p_report_id and suggestion_type = v_type and (
    (v_type <> 'faq' and proposed_content = v_content)
    or (v_type = 'faq'
      and lower(regexp_replace(btrim(proposed_content->>'question'), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(v_question, '[[:space:]]+', ' ', 'g'))
      and lower(regexp_replace(btrim(proposed_content->>'answer'), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(v_answer, '[[:space:]]+', ' ', 'g')))
  )
  order by created_at, id limit 1;
  if v_id is not null then return v_id; end if;

  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into v_turns
  from jsonb_array_elements_text(coalesce(p_suggestion->'evidence_turn_ids', '[]'::jsonb));
  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into v_messages
  from jsonb_array_elements_text(coalesce(p_suggestion->'evidence_message_ids', '[]'::jsonb));
  if cardinality(v_turns) + cardinality(v_messages) = 0 then
    raise exception 'learning_evidence_required' using errcode = '22023';
  end if;
  insert into public.customer_service_learning_suggestions (
    report_id, suggestion_type, title, reason, proposed_content,
    evidence_turn_ids, evidence_message_ids, runtime_target
  ) values (
    p_report_id, v_type, p_suggestion->>'title', coalesce(p_suggestion->>'reason', ''),
    v_content, v_turns, v_messages, case when v_type = 'faq' then 'faq' end
  ) returning id into v_id;

  -- Eligibility is computed from paired source messages by the trusted report
  -- service. Never accept model keywords as automatically approved aliases.
  if p_suggestion->'auto_alias_eligible' = 'true'::jsonb and v_type = 'faq'
     and length(v_question) between 4 and 500 and length(v_answer) >= 6
     and lower(regexp_replace(v_answer, '[[:space:]。.!！?？]', '', 'g')) not in ('可以', '好', '好的', '收到', '冇問題', '沒問題', '可以啊', '可以的', '好的收到', 'yes', 'okay', 'ok', 'sure', 'received', 'noproblem')
     and (v_question || ' ' || v_answer) !~* '退款|退錢|赔偿|賠償|價|价格|折扣|優惠|取消|停單|不接單|例外|大單|金額|承諾|保证|保證|日期|時間|時段|幾點|幾時|預訂|預約|訂位|有位|滿額|限額|截單|截止|今日|明日|明天|今天|星期|週末|周末|送達|到達|電話|電郵|地址|帳戶|賬戶|戶口|單號|訂單編號|[0-9@$＄€£¥]|https?://|www\.|refund|price|discount|cancel|exception|promise|guarantee|block[[:space:]]*date|availab|reserv|booking|delivery[[:space:]]*(date|time)|deadline|cutoff|today|tomorrow|weekend|account|e-?mail|phone|address|order[[:space:]]*(id|number)|\mdate\M|\mtime\M'
     and v_question !~ '[,，、;；\n\r]' then
    select * into v_faq from public.customer_faqs
    where locale = 'zh-HK' and is_published and answer = v_answer
    order by id limit 1 for update;
    if found then
      update public.customer_faqs
      set keywords = case
        when v_question = any(regexp_split_to_array(coalesce(keywords, ''), '[,，、;；][[:space:]]*')) then keywords
        else concat_ws(', ', nullif(keywords, ''), v_question)
      end, updated_at = now()
      where id = v_faq.id;
      update public.customer_service_learning_suggestions
      set status = 'published', target_faq_id = v_faq.id,
        runtime_target = 'faq:' || v_faq.id::text,
        execution_status = 'applied', executed_at = now(), reviewed_at = now(),
        execution_result = jsonb_build_object('mode', 'safe_alias', 'question', v_question, 'faq_id', v_faq.id),
        updated_at = now()
      where id = v_id;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.customer_service_learning_suggestion_store(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.customer_service_learning_suggestion_store(uuid, jsonb) to service_role;

commit;
