begin;

alter table public.customer_service_conversations
  add column if not exists handoff_kind text,
  add column if not exists handoff_urgent boolean not null default false,
  add column if not exists handoff_quote_id uuid;

alter table public.customer_service_conversations
  drop constraint if exists customer_service_conversations_handoff_kind_check;

alter table public.customer_service_conversations
  add constraint customer_service_conversations_handoff_kind_check
  check (
    handoff_kind is null or handoff_kind in (
      'same_day_catering',
      'future_catering',
      'order_change',
      'general'
    )
  );

update public.customer_service_conversations
set
  handoff_kind = case
    when active_goal = 'order_change' or selected_order_id is not null
      then 'order_change'
    else 'general'
  end,
  handoff_urgent = false
where state in ('awaiting_human', 'human_owned')
  and handoff_kind is null;

comment on column public.customer_service_conversations.handoff_kind is
  'Explicit queued handoff context. Never infer urgency from selected_order_id.';
comment on column public.customer_service_conversations.handoff_urgent is
  'True only for an explicitly detected same-day catering handoff.';
comment on column public.customer_service_conversations.handoff_quote_id is
  'Quote updated by the current catering handoff, if one has been written.';

insert into public.customer_service_reply_templates (
  template_key,
  display_name,
  content,
  locale,
  enabled
)
values (
  'help',
  '歡迎訊息',
  '你好，請問是查詢現有訂單，還是需要到會訂餐協助？',
  'zh-HK',
  true
)
on conflict (template_key) do update
set
  display_name = excluded.display_name,
  content = excluded.content,
  locale = excluded.locale,
  enabled = excluded.enabled,
  updated_at = now();

commit;
