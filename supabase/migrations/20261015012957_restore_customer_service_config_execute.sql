-- The Jev config migration recreated these RPCs and granted them only to
-- service_role. The settings UI calls them as the signed-in user. Both
-- functions already require settings.customer_faq page access.
grant execute on function public.customer_service_config_versions_list(text) to authenticated;
grant execute on function public.customer_service_config_create_tiered(text, text, text, text, boolean, numeric, text, numeric, integer, boolean, boolean, text, numeric, numeric, integer) to authenticated;
