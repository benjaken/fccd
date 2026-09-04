-- Avoid PL/pgSQL ambiguity between the RETURNS TABLE `turn_id` output variable
-- and the feedback table's primary-key column during an upsert.
create or replace function public.customer_service_turn_feedback_submit(
  p_turn_id uuid,
  p_verdict text,
  p_failure_category text default null,
  p_corrected_answer text default null,
  p_note text default null,
  p_create_faq_draft boolean default false
)
returns table (turn_id uuid, verdict text, learned_faq_id uuid)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_turn public.customer_service_turns%rowtype;
  v_faq_id uuid;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  if p_verdict not in ('correct', 'incorrect', 'needs_review') then
    raise exception 'invalid_feedback_verdict' using errcode = '22023';
  end if;

  select * into v_turn
  from public.customer_service_turns
  where id = p_turn_id;
  if not found then
    raise exception 'turn_not_found' using errcode = 'P0002';
  end if;

  if p_create_faq_draft
     and p_verdict = 'incorrect'
     and btrim(coalesce(p_corrected_answer, '')) <> '' then
    insert into public.customer_faqs(
      category, question, answer, keywords, locale, is_published, sort_order
    )
    values (
      'ordering', v_turn.question, btrim(p_corrected_answer), '', 'zh-HK', false, 0
    )
    on conflict (locale, question) do update
      set answer = excluded.answer,
          is_published = false,
          updated_at = now()
    returning id into v_faq_id;
  end if;

  insert into public.customer_service_turn_feedback(
    turn_id, verdict, failure_category, corrected_answer, note,
    learned_faq_id, reviewed_by, reviewed_at, updated_at
  )
  values (
    p_turn_id,
    p_verdict,
    nullif(btrim(coalesce(p_failure_category, '')), ''),
    nullif(btrim(coalesce(p_corrected_answer, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    v_faq_id,
    auth.uid(),
    now(),
    now()
  )
  on conflict on constraint customer_service_turn_feedback_pkey do update
  set verdict = excluded.verdict,
      failure_category = excluded.failure_category,
      corrected_answer = excluded.corrected_answer,
      note = excluded.note,
      learned_faq_id = coalesce(
        excluded.learned_faq_id,
        customer_service_turn_feedback.learned_faq_id
      ),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now();

  update public.customer_service_turns
  set ai_outcome = case p_verdict
        when 'correct' then 'success'
        when 'incorrect' then 'failure'
        else 'needs_review'
      end,
      ai_reason = coalesce(
        nullif(btrim(coalesce(p_note, '')), ''),
        ai_reason
      ),
      evaluated_at = now()
  where id = p_turn_id;

  return query
    select p_turn_id, p_verdict, feedback.learned_faq_id
    from public.customer_service_turn_feedback as feedback
    where feedback.turn_id = p_turn_id;
end;
$$;

revoke all on function public.customer_service_turn_feedback_submit(
  uuid, text, text, text, text, boolean
) from public, anon;

grant execute on function public.customer_service_turn_feedback_submit(
  uuid, text, text, text, text, boolean
) to authenticated;
