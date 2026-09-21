-- Detach every package member that is not assigned to any choice set (未分類).
-- The current Shopify definitions place every dish inside a choice set, so an
-- ungrouped member is stale. The rows are detached rather than deleted so the
-- historical order references and the previous package layout stay recoverable.
update public.package_products member
set package_id = null,
    updated_at = now()
where member.package_id is not null
  and member.package_choice_set_legacy_id is null;
