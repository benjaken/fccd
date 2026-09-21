begin;

-- Gratitude, agreement and emoji acknowledgements share one outbound copy so
-- every thank-you style message gets the same "you're welcome / anything else"
-- reply, including mixed emoji such as "Thank you so much! ❤️" and "多謝晒🙏".
insert into public.customer_service_reply_templates (
  template_key, display_name, content, locale, enabled
)
values
  ('thanks', '感謝訊息', '唔使客氣 😊 仲有咩可以幫到你？隨時同我哋講。', 'zh-HK', true),
  ('acknowledgement', '簡短確認訊息', '唔使客氣 😊 仲有咩可以幫到你？隨時同我哋講。', 'zh-HK', true)
on conflict (template_key) do update set
  content = excluded.content,
  enabled = true,
  updated_at = now();

commit;
