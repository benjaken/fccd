-- Remove the confusing email instruction from the configured WhatsApp reply.
-- replace() also cleans up any duplicated copies already saved in the template.

update public.customer_service_reply_templates
set
  content = btrim(
    replace(content, '唔使再喺 WhatsApp 補電郵。', '')
  ),
  updated_at = now()
where template_key = 'collect_done'
  and content like '%唔使再喺 WhatsApp 補電郵。%';
