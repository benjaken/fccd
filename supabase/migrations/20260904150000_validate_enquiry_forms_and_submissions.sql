-- Enforce the public enquiry contract in Postgres. Browser validation is UX
-- only; anon callers can invoke submit_enquiry_form directly.

create or replace function private.assert_valid_enquiry_form()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_question jsonb;
  v_option jsonb;
  v_key text;
  v_type text;
  v_quote_field text;
  v_option_value text;
  v_option_label text;
  v_keys text[] := '{}'::text[];
  v_quote_fields text[] := '{}'::text[];
  v_option_values text[];
  v_option_labels text[];
begin
  if nullif(btrim(new.internal_name), '') is null then
    raise exception 'enquiry_internal_name_required' using errcode = '22023';
  end if;
  if jsonb_typeof(new.questions) <> 'array' then
    raise exception 'enquiry_questions_must_be_array' using errcode = '22023';
  end if;
  if jsonb_array_length(new.questions) > 100 or octet_length(new.questions::text) > 131072 then
    raise exception 'enquiry_questions_too_large' using errcode = '22023';
  end if;
  if new.status = 'published' then
    if nullif(btrim(new.public_title), '') is null then
      raise exception 'enquiry_public_title_required' using errcode = '22023';
    end if;
    if nullif(btrim(new.slug), '') is null then
      raise exception 'enquiry_slug_required' using errcode = '22023';
    end if;
    if jsonb_array_length(new.questions) = 0 then
      raise exception 'enquiry_question_required' using errcode = '22023';
    end if;
  end if;

  for v_question in select value from jsonb_array_elements(new.questions)
  loop
    if jsonb_typeof(v_question) <> 'object' then
      raise exception 'enquiry_question_invalid' using errcode = '22023';
    end if;
    v_key := nullif(btrim(v_question->>'field_key'), '');
    v_type := v_question->>'type';
    if v_key is null or v_key = any(v_keys) then
      raise exception 'enquiry_question_key_invalid' using errcode = '22023';
    end if;
    v_keys := array_append(v_keys, v_key);
    if v_type not in ('radio', 'checkbox', 'input', 'textarea', 'date', 'number') then
      raise exception 'enquiry_question_type_invalid' using errcode = '22023';
    end if;
    if new.status = 'published' and nullif(btrim(v_question->>'title'), '') is null then
      raise exception 'enquiry_question_title_required' using errcode = '22023';
    end if;

    v_quote_field := nullif(btrim(v_question->>'quote_field'), '');
    if v_quote_field is not null then
      if v_quote_field not in (
        'customer_name', 'salutation', 'company_name', 'phone', 'email',
        'shipping_address', 'delivery_date', 'delivery_time', 'headcount',
        'quote_description'
      ) or v_quote_field = any(v_quote_fields) then
        raise exception 'enquiry_quote_field_invalid' using errcode = '22023';
      end if;
      v_quote_fields := array_append(v_quote_fields, v_quote_field);
    end if;

    if v_type = 'number'
      and nullif(v_question->>'min_number', '') is not null
      and nullif(v_question->>'max_number', '') is not null
      and (v_question->>'min_number')::numeric > (v_question->>'max_number')::numeric
    then
      raise exception 'enquiry_number_range_invalid' using errcode = '22023';
    end if;

    if v_type in ('radio', 'checkbox') then
      if jsonb_typeof(coalesce(v_question->'options', '[]'::jsonb)) <> 'array' then
        raise exception 'enquiry_options_must_be_array' using errcode = '22023';
      end if;
      if new.status = 'published'
        and jsonb_array_length(coalesce(v_question->'options', '[]'::jsonb)) = 0
      then
        raise exception 'enquiry_option_required' using errcode = '22023';
      end if;
      v_option_values := '{}'::text[];
      v_option_labels := '{}'::text[];
      for v_option in select value from jsonb_array_elements(coalesce(v_question->'options', '[]'::jsonb))
      loop
        v_option_value := nullif(btrim(v_option->>'value'), '');
        v_option_label := nullif(btrim(v_option->>'label'), '');
        if v_option_value is null or v_option_label is null
          or v_option_value = any(v_option_values)
          or v_option_label = any(v_option_labels)
        then
          raise exception 'enquiry_option_invalid' using errcode = '22023';
        end if;
        v_option_values := array_append(v_option_values, v_option_value);
        v_option_labels := array_append(v_option_labels, v_option_label);
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists validate_enquiry_form on public.enquiry_forms;
create trigger validate_enquiry_form
before insert or update of internal_name, public_title, slug, status, questions
on public.enquiry_forms
for each row execute function private.assert_valid_enquiry_form();

create or replace function private.assert_valid_enquiry_submission()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_question jsonb;
  v_option jsonb;
  v_answer jsonb;
  v_key text;
  v_type text;
  v_text text;
  v_empty boolean;
begin
  if jsonb_typeof(new.form_snapshot) <> 'array' or jsonb_typeof(new.answers) <> 'object' then
    raise exception 'enquiry_answers_invalid' using errcode = '22023';
  end if;
  if octet_length(new.answers::text) > 65536
    or (select count(*) from jsonb_object_keys(new.answers)) > 100
  then
    raise exception 'enquiry_answers_too_large' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(new.answers) as answer_key
    where not exists (
      select 1
      from jsonb_array_elements(new.form_snapshot) as question
      where question->>'field_key' = answer_key
    )
  ) then
    raise exception 'enquiry_answer_key_invalid' using errcode = '22023';
  end if;

  for v_question in select value from jsonb_array_elements(new.form_snapshot)
  loop
    v_key := v_question->>'field_key';
    v_type := v_question->>'type';
    v_answer := new.answers->v_key;
    v_empty := case
      when v_answer is null or v_answer = 'null'::jsonb then true
      when jsonb_typeof(v_answer) = 'string' then nullif(btrim(v_answer #>> '{}'), '') is null
      when jsonb_typeof(v_answer) = 'array' then jsonb_array_length(v_answer) = 0
      else false
    end;
    if coalesce((v_question->>'required')::boolean, false) and v_empty then
      raise exception 'enquiry_required_answer_missing:%', v_key using errcode = '22023';
    end if;
    if v_empty then
      continue;
    end if;

    if v_type in ('input', 'textarea', 'date', 'radio') and jsonb_typeof(v_answer) <> 'string' then
      raise exception 'enquiry_answer_type_invalid:%', v_key using errcode = '22023';
    elsif v_type = 'number' and jsonb_typeof(v_answer) <> 'number' then
      raise exception 'enquiry_answer_type_invalid:%', v_key using errcode = '22023';
    elsif v_type = 'checkbox' and jsonb_typeof(v_answer) <> 'array' then
      raise exception 'enquiry_answer_type_invalid:%', v_key using errcode = '22023';
    end if;

    if v_type in ('input', 'textarea', 'date', 'radio') then
      v_text := v_answer #>> '{}';
      if octet_length(v_text) > (case when v_type = 'textarea' then 20000 else 5000 end) then
        raise exception 'enquiry_answer_too_long:%', v_key using errcode = '22023';
      end if;
    end if;
    if v_type = 'input' and v_question->>'input_format' = 'email'
      and v_text !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    then
      raise exception 'enquiry_email_invalid:%', v_key using errcode = '22023';
    end if;
    if v_type = 'input' and v_question->>'input_format' = 'phone'
      and (char_length(v_text) > 50 or v_text !~ '^[0-9+() .-]{6,50}$')
    then
      raise exception 'enquiry_phone_invalid:%', v_key using errcode = '22023';
    end if;
    if v_type = 'date' then
      if v_text !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'enquiry_date_invalid:%', v_key using errcode = '22023';
      end if;
      begin
        perform v_text::date;
      exception when datetime_field_overflow then
        raise exception 'enquiry_date_invalid:%', v_key using errcode = '22023';
      end;
    end if;
    if v_type = 'number' then
      if nullif(v_question->>'min_number', '') is not null
        and (v_answer #>> '{}')::numeric < (v_question->>'min_number')::numeric
      then
        raise exception 'enquiry_number_too_small:%', v_key using errcode = '22023';
      end if;
      if nullif(v_question->>'max_number', '') is not null
        and (v_answer #>> '{}')::numeric > (v_question->>'max_number')::numeric
      then
        raise exception 'enquiry_number_too_large:%', v_key using errcode = '22023';
      end if;
    end if;
    if v_type = 'radio' and not exists (
      select 1 from jsonb_array_elements(coalesce(v_question->'options', '[]'::jsonb)) as option
      where option->>'value' = v_text
    ) then
      raise exception 'enquiry_option_not_allowed:%', v_key using errcode = '22023';
    end if;
    if v_type = 'checkbox' then
      if jsonb_array_length(v_answer) > 100 or exists (
        select 1
        from jsonb_array_elements(v_answer) as selected
        where jsonb_typeof(selected) <> 'string'
          or not exists (
            select 1 from jsonb_array_elements(coalesce(v_question->'options', '[]'::jsonb)) as option
            where option->>'value' = selected #>> '{}'
          )
      ) then
        raise exception 'enquiry_option_not_allowed:%', v_key using errcode = '22023';
      end if;
      if coalesce((v_question->>'require_all_options')::boolean, false) and exists (
        select 1 from jsonb_array_elements(coalesce(v_question->'options', '[]'::jsonb)) as option
        where not (v_answer ? (option->>'value'))
      ) then
        raise exception 'enquiry_all_options_required:%', v_key using errcode = '22023';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists validate_enquiry_submission on public.enquiry_submissions;
create trigger validate_enquiry_submission
before insert or update of answers, form_snapshot
on public.enquiry_submissions
for each row execute function private.assert_valid_enquiry_submission();

-- Complete conversion and detail persistence in one transaction. If any detail,
-- delivery, or tag write fails, the quote and converted marker roll back together.
create or replace function public.finalize_enquiry_to_quote(
  p_submission_id uuid,
  p_draft jsonb
)
returns table(id uuid, order_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_order_number text;
  v_channel_id uuid;
  v_district_id uuid;
  v_district_name text := nullif(btrim(p_draft->>'districtName'), '');
  v_delivery_at timestamptz;
  v_delivery_id uuid;
  v_tag_ids uuid[] := '{}'::uuid[];
begin
  if not private.has_page_manage('quotes') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_draft) <> 'object' or octet_length(p_draft::text) > 65536 then
    raise exception 'quote_draft_invalid' using errcode = '22023';
  end if;
  begin
    v_channel_id := nullif(p_draft->>'channelId', '')::uuid;
    v_district_id := nullif(p_draft->>'districtId', '')::uuid;
    if nullif(p_draft->>'deliveryDate', '') is not null then
      v_delivery_at := (p_draft->>'deliveryDate')::date::timestamp at time zone 'Asia/Hong_Kong';
    end if;
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_tag_ids
    from jsonb_array_elements_text(coalesce(p_draft->'tagIds', '[]'::jsonb)) as value;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'quote_draft_invalid' using errcode = '22023';
  end;
  if v_channel_id is null then
    raise exception 'channel_required' using errcode = '22023';
  end if;
  if v_district_id is null and v_district_name is not null then
    select district.id into v_district_id
    from public.delivery_districts as district
    where lower(btrim(district.name)) = lower(v_district_name)
      and district.archived_at is null
    order by district.created_at
    limit 1;
  end if;

  select converted.id, converted.order_number
    into v_quote_id, v_order_number
  from public.convert_enquiry_to_quote(p_submission_id, v_channel_id) as converted;

  update public.orders
  set
    channel_id = v_channel_id,
    quote_status = nullif(btrim(p_draft->>'quoteStatus'), ''),
    quote_sales_source_id = nullif(p_draft->>'quoteSalesSourceId', '')::uuid,
    quote_communication_channel_id = nullif(p_draft->>'quoteCommunicationChannelId', '')::uuid,
    quote_follow_up_date = nullif(p_draft->>'followUpDate', '')::date,
    customer_name_snapshot = nullif(btrim(p_draft->>'customerName'), ''),
    company_name_snapshot = nullif(btrim(p_draft->>'companyName'), ''),
    contact_number_a_snapshot = nullif(btrim(p_draft->>'contactA'), ''),
    contact_number_b_snapshot = nullif(btrim(p_draft->>'contactB'), ''),
    email_snapshot = nullif(btrim(p_draft->>'email'), ''),
    shipping_address_snapshot = nullif(btrim(p_draft->>'address'), ''),
    customer_note_snapshot = nullif(btrim(p_draft->>'customerNote'), ''),
    shipping_method_id = nullif(p_draft->>'shippingMethodId', '')::uuid,
    delivery_district_id = v_district_id,
    delivery_at = v_delivery_at,
    delivery_time = nullif(btrim(p_draft->>'deliveryTime'), ''),
    ship_out_time = nullif(btrim(p_draft->>'shipOutTime'), ''),
    factory_packing_note = nullif(btrim(p_draft->>'packingNote'), ''),
    sales_partner_id = nullif(p_draft->>'salesPartnerId', '')::uuid,
    remarks = nullif(btrim(p_draft->>'internalNote'), ''),
    is_hong_kong_famous_brand = coalesce((p_draft->>'isHongKongFamousBrand')::boolean, false),
    famous_brand_tag_ids = coalesce(
      array(select value::uuid from jsonb_array_elements_text(coalesce(p_draft->'famousBrandTagIds', '[]'::jsonb)) as value),
      '{}'::uuid[]
    ),
    asana_link = nullif(btrim(p_draft->>'asanaLink'), ''),
    updated_at = now()
  where public.orders.id = v_quote_id
    and public.orders.document_type = 'quote';
  if not found then
    raise exception 'quote_not_found' using errcode = '22023';
  end if;

  select delivery.id into v_delivery_id
  from public.deliveries as delivery
  where delivery.order_id = v_quote_id
  order by delivery.created_at
  limit 1;
  if v_delivery_id is null then
    v_delivery_id := gen_random_uuid();
    insert into public.deliveries (
      id, legacy_id, order_id, district_id, shipping_method_id,
      delivery_at, delivery_time, ship_out_time, delivery_status
    ) values (
      v_delivery_id, 'web-delivery-' || v_delivery_id, v_quote_id, v_district_id,
      nullif(p_draft->>'shippingMethodId', '')::uuid, v_delivery_at,
      nullif(btrim(p_draft->>'deliveryTime'), ''),
      nullif(btrim(p_draft->>'shipOutTime'), ''), 'Pending'
    );
  else
    update public.deliveries
    set
      district_id = v_district_id,
      shipping_method_id = nullif(p_draft->>'shippingMethodId', '')::uuid,
      delivery_at = v_delivery_at,
      delivery_time = nullif(btrim(p_draft->>'deliveryTime'), ''),
      ship_out_time = nullif(btrim(p_draft->>'shipOutTime'), '')
    where public.deliveries.id = v_delivery_id;
  end if;

  delete from public.order_tag_assignments where order_id = v_quote_id;
  insert into public.order_tag_assignments(order_id, order_tag_id)
  select v_quote_id, tag_id from unnest(v_tag_ids) as tag_id
  on conflict do nothing;

  return query select v_quote_id, v_order_number;
end;
$$;

revoke all on function public.finalize_enquiry_to_quote(uuid, jsonb) from public;
grant execute on function public.finalize_enquiry_to_quote(uuid, jsonb) to authenticated;
