-- Enquiry numbers are a daily Hong Kong sequence: ENQ20260903001.
-- Keep the qualified submit_enquiry_form body from 20260903110000.

create or replace function public.submit_enquiry_form(
  p_form_id uuid,
  p_answers jsonb,
  p_idempotency_key text,
  p_honeypot text default null
)
returns table(id uuid, reference_code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_form public.enquiry_forms;
  v_existing public.enquiry_submissions;
  v_id uuid := gen_random_uuid();
  v_code text;
  v_prefix text;
  v_sequence integer;
  v_question jsonb;
  v_key text;
  v_field text;
  v_text text;
  v_customer_name text;
  v_salutation text;
  v_company_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_delivery_raw text;
  v_delivery_date date;
  v_delivery_time text;
  v_headcount text;
  v_quote_description text;
  v_ack_status text;
begin
  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    return query select v_id, 'ENQ-IGNORED';
    return;
  end if;

  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'idempotency_required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.enquiry_submissions
  where enquiry_submissions.idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.reference_code;
    return;
  end if;

  select * into v_form
  from public.enquiry_forms
  where enquiry_forms.id = p_form_id and enquiry_forms.status = 'published';
  if not found then
    raise exception 'form_unavailable' using errcode = '22023';
  end if;

  for v_question in select * from jsonb_array_elements(coalesce(v_form.questions, '[]'::jsonb))
  loop
    v_key := v_question->>'field_key';
    v_field := nullif(v_question->>'quote_field', '');
    v_text := private.enquiry_answer_text(p_answers -> v_key);
    if v_field = 'customer_name' then v_customer_name := v_text; end if;
    if v_field = 'salutation' then v_salutation := v_text; end if;
    if v_field = 'company_name' then v_company_name := v_text; end if;
    if v_field = 'phone' then v_phone := v_text; end if;
    if v_field = 'email' then v_email := v_text; end if;
    if v_field = 'shipping_address' then v_address := v_text; end if;
    if v_field = 'delivery_date' then
      v_delivery_raw := v_text;
      begin
        if v_text ~ '^\d{4}-\d{2}-\d{2}$' then
          v_delivery_date := v_text::date;
        end if;
      exception when others then
        v_delivery_date := null;
      end;
    end if;
    if v_field = 'delivery_time' then v_delivery_time := v_text; end if;
    if v_field = 'headcount' then v_headcount := v_text; end if;
    if v_field = 'quote_description' then v_quote_description := v_text; end if;
  end loop;

  v_prefix := 'ENQ' || to_char(timezone('Asia/Hong_Kong', now()), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext('enquiry-number-' || v_prefix));
  select coalesce(max(substring(submission.reference_code from char_length(v_prefix) + 1)::integer), 0) + 1
    into v_sequence
  from public.enquiry_submissions as submission
  where submission.reference_code ~ ('^' || v_prefix || '[0-9]{3,}$');
  v_code := v_prefix || lpad(v_sequence::text, 3, '0');
  v_ack_status := case
    when v_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then 'not_sent'
    else 'no_email'
  end;

  insert into public.enquiry_submissions (
    id, form_id, form_title, form_snapshot, answers, original_answers,
    idempotency_key, reference_code, customer_name, salutation, company_name,
    phone, email, shipping_address, delivery_date_raw, delivery_date, delivery_time,
    headcount, quote_description, internal_email_status, ack_email_status, asana_status
  ) values (
    v_id, v_form.id, v_form.public_title, v_form.questions, coalesce(p_answers, '{}'::jsonb),
    coalesce(p_answers, '{}'::jsonb), p_idempotency_key, v_code,
    nullif(v_customer_name, ''), nullif(v_salutation, ''), nullif(v_company_name, ''),
    nullif(v_phone, ''), nullif(v_email, ''), nullif(v_address, ''),
    nullif(v_delivery_raw, ''), v_delivery_date, nullif(v_delivery_time, ''),
    nullif(v_headcount, ''), nullif(v_quote_description, ''),
    'not_sent', v_ack_status, 'not_created'
  );

  return query select v_id, v_code;
end;
$$;

revoke all on function public.submit_enquiry_form(uuid, jsonb, text, text) from public;
grant execute on function public.submit_enquiry_form(uuid, jsonb, text, text) to anon, authenticated;

with ranked as (
  select
    submission.id,
    'ENQ' || to_char(timezone('Asia/Hong_Kong', submission.created_at), 'YYYYMMDD') as prefix,
    row_number() over (
      partition by to_char(timezone('Asia/Hong_Kong', submission.created_at), 'YYYYMMDD')
      order by submission.created_at, submission.id
    ) as seq
  from public.enquiry_submissions as submission
  where submission.reference_code ~ '^ENQ[0-9]{8}-'
)
update public.enquiry_submissions as submission
set
  reference_code = ranked.prefix || lpad(ranked.seq::text, 3, '0'),
  updated_at = now()
from ranked
where submission.id = ranked.id;
