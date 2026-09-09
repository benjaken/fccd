update public.app_pages
set display_name = '出貨入貨記錄',
    updated_at = now()
where page_key = 'workspace.factory.warehouse';
