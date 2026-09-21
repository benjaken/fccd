begin;

-- Editors can correct a draft FAQ learning proposal before approving it. The
-- stored draft is updated in place so approval and bulk approval keep using the
-- edited answer; runtime (intent/policy) proposals stay untouched.
create or replace function public.customer_service_learning_suggestion_update(
  p_id uuid, p_content jsonb
)
returns table (id uuid, proposed_content jsonb)
language plpgsql security definer set search_path = public, private as $$
declare
  v_suggestion public.customer_service_learning_suggestions%rowtype;
  v_question text;
  v_answer text;
  v_category text;
  v_keywords text;
  v_content jsonb;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'invalid_suggestion_content' using errcode = '22023';
  end if;

  select suggestions.* into v_suggestion
  from public.customer_service_learning_suggestions suggestions
  where suggestions.id = p_id for update;
  if not found then raise exception 'suggestion_not_found' using errcode = 'P0002'; end if;
  if v_suggestion.status <> 'draft' then
    raise exception 'suggestion_already_reviewed' using errcode = '55000';
  end if;
  if v_suggestion.suggestion_type <> 'faq' then
    raise exception 'suggestion_not_editable' using errcode = '22023';
  end if;

  v_question := btrim(coalesce(p_content->>'question', ''));
  v_answer := btrim(coalesce(p_content->>'answer', ''));
  v_category := btrim(coalesce(p_content->>'category', ''));
  v_keywords := btrim(coalesce(p_content->>'keywords', ''));
  if v_question = '' or v_answer = '' then
    raise exception 'suggestion_mapping_required' using errcode = '22023';
  end if;
  if v_category not in ('ordering', 'delivery', 'payment', 'membership', 'menu') then
    raise exception 'suggestion_mapping_invalid' using errcode = '22023';
  end if;
  if private.customer_service_learning_faq_is_blocked(v_question, v_answer) then
    raise exception 'suggestion_faq_gate_failed' using errcode = '22023';
  end if;

  v_content := coalesce(v_suggestion.proposed_content, '{}'::jsonb)
    || jsonb_build_object(
      'question', v_question, 'answer', v_answer,
      'category', v_category, 'keywords', v_keywords
    );

  update public.customer_service_learning_suggestions suggestions
  set proposed_content = v_content, updated_at = now()
  where suggestions.id = p_id;

  return query select p_id, v_content;
end;
$$;

revoke all on function public.customer_service_learning_suggestion_update(uuid, jsonb) from public, anon;
grant execute on function public.customer_service_learning_suggestion_update(uuid, jsonb) to authenticated;

commit;
