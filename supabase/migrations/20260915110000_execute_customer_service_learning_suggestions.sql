begin;

alter table public.customer_service_learning_suggestions
  add column if not exists runtime_target text,
  add column if not exists execution_status text not null default 'pending'
    check (execution_status in ('pending', 'applied', 'failed', 'not_applicable')),
  add column if not exists execution_result jsonb not null default '{}'::jsonb,
  add column if not exists executed_at timestamptz;

-- The old executor marked intent/policy rows approved without applying anything.
-- Requeue only the nine affected rows, and attach explicit operations against
-- tables that the WhatsApp runtime reads for every turn.
update public.customer_service_learning_suggestions suggestions
set
  proposed_content = case suggestions.id
    when '7caf2740-7222-4146-8cc3-0ab5bed0aa66'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(jsonb_build_object(
        'target', 'intent', 'key', 'lookup_order',
        'patch', jsonb_build_object(
          'description_append', '含明確訂單編號的餐具、筷子或包裝用品查詢，應先使用訂單查詢工具，不應直接轉人工。',
          'examples_append', jsonb_build_array('B-1550C 有冇餐具？', 'R/202609/88 張單有冇筷子？')
        )
      ))
    )
    when '7d18bfd3-20a0-493e-843c-2e34505c16c0'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(jsonb_build_object(
        'target', 'reply_template', 'key', 'acknowledgement',
        'patch', jsonb_build_object(
          'display_name', '簡短確認訊息',
          'content', '收到，多謝你。請問仲有咩可以幫到你？',
          'enabled', true
        )
      ))
    )
    when 'd7d830bb-16da-46e0-bcb3-97fa719e5b23'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(
        jsonb_build_object(
          'target', 'intent', 'key', 'complaint_refund',
          'patch', jsonb_build_object(
            'description_append', '發霉、異物、筷子或包裝質素問題屬售後投訴；先請客人保留產品並提供照片及訂單資料，再交真人跟進。',
            'examples_append', jsonb_build_array('食物發霉', '筷子發霉', '包裝有異物')
          )
        ),
        jsonb_build_object(
          'target', 'reply_template', 'key', 'complaint_handoff',
          'patch', jsonb_build_object(
            'display_name', '產品投訴收集資料',
            'content', '唔好意思出現呢個情況。請先保留產品，並傳送問題照片及訂單編號；我已幫你記錄，客服同事會跟進。',
            'enabled', true
          )
        )
      )
    )
    when '1558c5dd-f951-41be-9dce-61e749eba02b'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(
        jsonb_build_object(
          'target', 'intent', 'key', 'search_faq',
          'patch', jsonb_build_object(
            'description_append', '一般外賣盒、餐具及包裝用品查詢先直接收集種類及數量，不應立即轉人工。',
            'examples_append', jsonb_build_array('想要外賣盒', '可唔可以提供多幾個餐盒？')
          )
        ),
        jsonb_build_object(
          'target', 'reply_template', 'key', 'packaging_request',
          'patch', jsonb_build_object(
            'display_name', '外賣包裝用品請求',
            'content', '可以先話我知需要邊款外賣盒／餐具、數量，同埋有冇相關訂單編號，我會按資料幫你跟進。',
            'enabled', true
          )
        )
      )
    )
    when '15d39fc3-79b4-4c23-8ffb-65dc77a3778b'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(jsonb_build_object(
        'target', 'reply_template', 'key', 'refuse',
        'patch', jsonb_build_object(
          'display_name', '非服務範圍',
          'content', '唔好意思，我哋呢度只處理 Food Channels 訂單、到會及已公布服務資料。如有相關需要，請直接講低查詢內容。',
          'enabled', true
        )
      ))
    )
    when '0b4f9caa-42f5-45e4-82c0-566b7d0d2563'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(jsonb_build_object(
        'target', 'intent', 'key', 'collect_inquiry',
        'patch', jsonb_build_object(
          'description_append', '若訊息已包含活動日期或人數，必須保留已提取欄位，只追問仍欠資料，不可重複索取。',
          'examples_append', jsonb_build_array('9月26日 80人到會', '26/9，約五十位')
        )
      ))
    )
    when '4a137ef8-35e4-4ff0-9e5a-fe9459097a76'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(jsonb_build_object(
        'target', 'reply_template', 'key', 'thanks',
        'patch', jsonb_build_object(
          'display_name', '感謝訊息',
          'content', '唔使客氣，多謝你。',
          'enabled', true
        )
      ))
    )
    when '2183f904-e858-4ec5-84e4-88745630596c'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(jsonb_build_object(
        'target', 'intent', 'key', 'lookup_order',
        'patch', jsonb_build_object(
          'description_append', '沒有明確訂單編號或尚未由客人選定訂單時，不得回覆任何一張訂單的具體資料；應先列出可選訂單或要求訂單編號。',
          'examples_append', jsonb_build_array('我張單幾時送？', '想查送貨日期')
        )
      ))
    )
    when '59c3ecb7-23e2-4bd6-a716-28e8e3527c32'::uuid then jsonb_build_object(
      'runtime_changes', jsonb_build_array(jsonb_build_object(
        'target', 'reply_template', 'key', 'help',
        'patch', jsonb_build_object(
          'display_name', '歡迎訊息',
          'content', '你好，我可以幫你查現有訂單、了解到會訂餐，或者回答運費、餐牌等服務問題。請問想了解邊一方面？',
          'enabled', true
        )
      ))
    )
    else suggestions.proposed_content
  end,
  runtime_target = case suggestions.id
    when '7caf2740-7222-4146-8cc3-0ab5bed0aa66'::uuid then 'intent:lookup_order'
    when '7d18bfd3-20a0-493e-843c-2e34505c16c0'::uuid then 'reply_template:acknowledgement'
    when 'd7d830bb-16da-46e0-bcb3-97fa719e5b23'::uuid then 'intent:complaint_refund + reply_template:complaint_handoff'
    when '1558c5dd-f951-41be-9dce-61e749eba02b'::uuid then 'intent:search_faq + reply_template:packaging_request'
    when '15d39fc3-79b4-4c23-8ffb-65dc77a3778b'::uuid then 'reply_template:refuse'
    when '0b4f9caa-42f5-45e4-82c0-566b7d0d2563'::uuid then 'intent:collect_inquiry'
    when '4a137ef8-35e4-4ff0-9e5a-fe9459097a76'::uuid then 'reply_template:thanks'
    when '2183f904-e858-4ec5-84e4-88745630596c'::uuid then 'intent:lookup_order'
    when '59c3ecb7-23e2-4bd6-a716-28e8e3527c32'::uuid then 'reply_template:help'
  end,
  status = 'draft',
  execution_status = 'pending',
  execution_result = '{}'::jsonb,
  executed_at = null,
  reviewed_by = null,
  reviewed_at = null,
  target_faq_id = null,
  updated_at = now()
where suggestions.id = any(array[
  '7caf2740-7222-4146-8cc3-0ab5bed0aa66'::uuid,
  '7d18bfd3-20a0-493e-843c-2e34505c16c0'::uuid,
  'd7d830bb-16da-46e0-bcb3-97fa719e5b23'::uuid,
  '1558c5dd-f951-41be-9dce-61e749eba02b'::uuid,
  '15d39fc3-79b4-4c23-8ffb-65dc77a3778b'::uuid,
  '0b4f9caa-42f5-45e4-82c0-566b7d0d2563'::uuid,
  '4a137ef8-35e4-4ff0-9e5a-fe9459097a76'::uuid,
  '2183f904-e858-4ec5-84e4-88745630596c'::uuid,
  '59c3ecb7-23e2-4bd6-a716-28e8e3527c32'::uuid
]);

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
      coalesce(array_length(suggestions.evidence_turn_ids, 1), 0),
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
  if p_status not in ('approved', 'rejected') then
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
    on conflict (locale, question) do update set
      answer = excluded.answer, category = excluded.category,
      keywords = excluded.keywords, is_published = excluded.is_published,
      updated_at = now()
    returning customer_faqs.id into v_faq_id;
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
      if v_key = '' or v_patch is null or jsonb_typeof(v_patch) <> 'object' then
        raise exception 'suggestion_mapping_invalid' using errcode = '22023';
      end if;

      if v_target = 'intent' then
        if v_patch - array['description_append', 'examples_append']::text[] <> '{}'::jsonb
           or (v_patch ? 'examples_append' and jsonb_typeof(v_patch->'examples_append') <> 'array') then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
        end if;
        select coalesce(array_agg(value), '{}'::text[]) into v_examples
        from jsonb_array_elements_text(coalesce(v_patch->'examples_append', '[]'::jsonb));
        update public.customer_service_intents intents
        set description = case
              when btrim(coalesce(v_patch->>'description_append', '')) = ''
                or intents.description like '%' || btrim(v_patch->>'description_append') || '%'
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
        if v_patch - array['instructions_append', 'context_window', 'clarification_threshold', 'auto_resume', 'enabled']::text[] <> '{}'::jsonb then
          raise exception 'suggestion_mapping_invalid' using errcode = '22023';
        end if;
        update public.customer_service_workflow_policies policies
        set instructions = case
              when btrim(coalesce(v_patch->>'instructions_append', '')) = ''
                or policies.instructions like '%' || btrim(v_patch->>'instructions_append') || '%'
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

commit;
