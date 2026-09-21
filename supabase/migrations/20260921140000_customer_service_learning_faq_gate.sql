begin;

create or replace function private.customer_service_learning_faq_is_blocked(
  p_question text,
  p_answer text
)
returns boolean
language sql
immutable
as $$
  select
    btrim(coalesce(p_question, '')) = ''
    or btrim(coalesce(p_answer, '')) = ''
    or btrim(p_question) ~* '^(test+|hi+|hello+|hey+|哈囉|你好|在嗎|ping|ok)[[:space:]!！.。?？]*$'
    or btrim(p_question) ~* '急單'
    or (
      btrim(p_question) ~* '即日|今日|今天|same[[:space:]]*day|\btoday\b'
      and btrim(p_question) ~* '想訂|要訂|幫我訂|做唔做|得唔得|可以嗎|可唔可以'
    )
    or (
      char_length(btrim(p_answer)) <= 80
      and btrim(p_answer) ~ '[?？]'
      and btrim(p_answer) ~ '請問|有咩幫|有什麼幫|可以幫到你|送貨地區'
    );
$$;

create or replace function private.customer_service_learning_faq_gate()
returns trigger
language plpgsql
as $$
begin
  if new.suggestion_type <> 'faq' then
    return new;
  end if;
  if private.customer_service_learning_faq_is_blocked(
    btrim(coalesce(new.proposed_content->>'question', '')),
    btrim(coalesce(new.proposed_content->>'answer', ''))
  ) then
    if tg_op = 'INSERT' then
      return null;
    end if;
    if new.status in ('approved', 'published') then
      raise exception 'suggestion_faq_gate_failed' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists z_customer_service_learning_faq_gate
  on public.customer_service_learning_suggestions;
create trigger z_customer_service_learning_faq_gate
before insert or update on public.customer_service_learning_suggestions
for each row execute function private.customer_service_learning_faq_gate();

update public.customer_service_learning_suggestions
set
  status = 'rejected',
  execution_status = 'not_applicable',
  execution_result = jsonb_build_object('review', 'rejected', 'reason', 'learning_faq_gate'),
  updated_at = now()
where status = 'draft'
  and suggestion_type = 'faq'
  and private.customer_service_learning_faq_is_blocked(
    btrim(coalesce(proposed_content->>'question', '')),
    btrim(coalesce(proposed_content->>'answer', ''))
  );

commit;
