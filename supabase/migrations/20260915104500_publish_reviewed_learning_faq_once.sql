-- One explicit approval is sufficient: the reviewer has already accepted the
-- exact question and answer shown in the learning queue.
create or replace function public.customer_service_learning_suggestion_review(p_id uuid, p_status text)
returns table (suggestion_id uuid, suggestion_status text, target_faq_id uuid)
language plpgsql security definer set search_path = public, private as $$
declare
  v_suggestion public.customer_service_learning_suggestions%rowtype;
  v_question text; v_answer text; v_category text; v_keywords text; v_faq_id uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid_suggestion_status' using errcode = '22023'; end if;
  select suggestions.* into v_suggestion from public.customer_service_learning_suggestions suggestions
  where suggestions.id = p_id for update;
  if not found then raise exception 'suggestion_not_found' using errcode = 'P0002'; end if;
  if v_suggestion.status <> 'draft' then raise exception 'suggestion_already_reviewed' using errcode = '55000'; end if;

  if p_status = 'approved' and v_suggestion.suggestion_type = 'faq' then
    v_question := btrim(coalesce(v_suggestion.proposed_content->>'question', ''));
    v_answer := btrim(coalesce(v_suggestion.proposed_content->>'answer', ''));
    v_category := btrim(coalesce(v_suggestion.proposed_content->>'category', 'ordering'));
    v_keywords := btrim(coalesce(v_suggestion.proposed_content->>'keywords', ''));
    if v_category not in ('ordering', 'delivery', 'payment', 'membership', 'menu') then v_category := 'ordering'; end if;
    if v_question <> '' and v_answer <> '' then
      insert into public.customer_faqs (category, question, answer, keywords, locale, is_published, sort_order)
      values (v_category, v_question, v_answer, v_keywords, 'zh-HK', true, 0)
      on conflict (locale, question) do nothing returning customer_faqs.id into v_faq_id;
      if v_faq_id is null then
        select faqs.id into v_faq_id from public.customer_faqs faqs
        where faqs.locale = 'zh-HK' and faqs.question = v_question limit 1;
      end if;
    end if;
  end if;
  update public.customer_service_learning_suggestions suggestions
  set status = p_status, target_faq_id = coalesce(v_faq_id, suggestions.target_faq_id),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where suggestions.id = p_id;
  return query select p_id, p_status, coalesce(v_faq_id, v_suggestion.target_faq_id);
end;
$$;

revoke all on function public.customer_service_learning_suggestion_review(uuid, text) from public, anon;
grant execute on function public.customer_service_learning_suggestion_review(uuid, text) to authenticated;
