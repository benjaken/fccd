-- Same-day / urgent WhatsApp catering requests notify staff immediately
-- instead of waiting for the 09:00 HKT handoff digest.

drop function if exists public.customer_service_handoff_enqueue(
  text, text, uuid, text, text, text
);

create or replace function public.customer_service_handoff_enqueue(
  p_environment text,
  p_phone text,
  p_order_id uuid,
  p_order_number text,
  p_summary text,
  p_kind text default 'order_handoff',
  p_notify_immediately boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_id uuid;
  v_question jsonb := jsonb_build_object('at', now(), 'text', left(btrim(coalesce(p_summary, '')), 2000));
  v_notify_after timestamptz := case
    when coalesce(p_notify_immediately, false)
      then now()
    else private.next_customer_service_handoff_notification_at(now())
  end;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if v_phone = '' or btrim(coalesce(p_summary, '')) = '' then
    raise exception 'handoff_details_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(nullif(btrim(p_environment), ''), 'production') || ':' || v_phone,
    0
  ));

  select request.id into v_id
  from public.customer_service_handoff_requests request
  where request.environment = coalesce(nullif(btrim(p_environment), ''), 'production')
    and request.phone_normalized = v_phone
    and request.status in ('pending', 'processing', 'notified', 'in_progress', 'failed')
  for update;

  if v_id is null then
    insert into public.customer_service_handoff_requests (
      environment, phone_normalized, order_id, order_number, kind, summary,
      questions, notify_after
    ) values (
      coalesce(nullif(btrim(p_environment), ''), 'production'), v_phone, p_order_id,
      nullif(btrim(coalesce(p_order_number, '')), ''), coalesce(nullif(btrim(p_kind), ''), 'order_handoff'),
      left(btrim(p_summary), 2000), jsonb_build_array(v_question),
      v_notify_after
    ) returning id into v_id;
  else
    update public.customer_service_handoff_requests
    set
      order_id = coalesce(p_order_id, order_id),
      order_number = coalesce(nullif(btrim(coalesce(p_order_number, '')), ''), order_number),
      kind = coalesce(nullif(btrim(p_kind), ''), kind),
      summary = left(btrim(p_summary), 2000),
      questions = questions || jsonb_build_array(v_question),
      message_count = message_count + 1,
      status = case when status = 'failed' then 'pending' else status end,
      -- Promote deferred handoffs to immediate when a same-day urgent follow-up arrives.
      notify_after = case
        when coalesce(p_notify_immediately, false) and status in ('pending', 'failed')
          then least(notify_after, now())
        else notify_after
      end,
      last_customer_message_at = now(),
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.customer_service_handoff_enqueue(
  text, text, uuid, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.customer_service_handoff_enqueue(
  text, text, uuid, text, text, text, boolean
) to service_role;

-- Keep kitchen_confirmation examples aligned with same-day ordering language.
update public.customer_service_intents
set
  examples = array[
    '三個鐘後送貨做唔做到',
    '呢款菜可唔可以轉配料',
    '聽日有冇火雞',
    '幫我問廚房做到嗎',
    '即日訂餐',
    '今日想訂到會急單',
    '今天要訂餐，急'
  ],
  description = '急單、即日訂餐、即日特別安排、季節產品、菜式或配料更換，以及任何要由廚房確認能否製作的要求。必須通知真人，不能由模型承諾。即日訂餐需求需即時通知同事。',
  updated_at = now()
where intent_key = 'kitchen_confirmation';

insert into public.customer_service_reply_templates (
  template_key, display_name, content, locale, enabled, updated_at
)
values (
  'same_day_urgent',
  '即日訂餐緊急回覆',
  $tpl$你好。已收到你嘅即日／急單訂餐需求，我已經即時通知同事跟進。即日到會亦可先喺 FC Express 網站查看供應同落單：https://www.foodchannels-express.com/ 。未收到同事回覆前，系統唔可以保證當日一定做到；你可以繼續補充人數、時間或地址。$tpl$,
  'zh-HK',
  true,
  now()
)
on conflict (template_key) do update
set display_name = excluded.display_name,
    content = excluded.content,
    locale = excluded.locale,
    enabled = true,
    updated_at = now();
