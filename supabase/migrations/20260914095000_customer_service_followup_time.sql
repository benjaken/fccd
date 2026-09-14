-- Make the follow-up timing explicit in the WhatsApp catering-inquiry reply.

update public.customer_service_reply_templates
set
  content = '已經幫你記低，客服會喺下一個工作日上午 9 點後跟進。',
  updated_at = now()
where template_key = 'collect_done';
