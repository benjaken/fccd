-- Promote the operations follow-up page from the Home submenu to a
-- first-level navigation page while preserving its existing permission key.
update public.app_pages
set
  display_name = '營運跟進',
  sort_order = 15,
  parent_page_key = null,
  page_kind = 'page',
  updated_at = now()
where page_key = 'overview.follow_up';
