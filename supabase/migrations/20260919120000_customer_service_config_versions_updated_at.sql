begin;
-- Surface updated_at so the model lab can show both created and last-modified
-- times for each candidate configuration version.
-- RETURNS TABLE changes require DROP; preserve all previously used fields.
drop function if exists public.customer_service_config_versions_list(text);
create function public.customer_service_config_versions_list(p_environment text default null)
returns table(
 id uuid,environment text,version integer,label text,model text,system_prompt text,
 temperature numeric,retrieval_limit integer,rag_config jsonb,status text,
 activated_at timestamptz,created_at timestamptz,updated_at timestamptz,
 fallback_model text,fallback_enabled boolean,escalation_confidence numeric
) language plpgsql stable security definer set search_path = pg_catalog,public,private,pg_temp as $$
begin
 if not private.has_page_access('settings.customer_faq') then raise exception 'page_access_required' using errcode='42501'; end if;
 return query select c.id,c.environment,c.version,c.label,c.model,c.system_prompt,c.temperature,
 c.retrieval_limit,c.rag_config,c.status,c.activated_at,c.created_at,c.updated_at,
 c.fallback_model,c.fallback_enabled,c.escalation_confidence::numeric
 from public.customer_service_config_versions c
 where p_environment is null or c.environment=p_environment order by c.environment,c.version desc;
end;
$$;
revoke all on function public.customer_service_config_versions_list(text) from public,anon;
grant execute on function public.customer_service_config_versions_list(text) to authenticated;
commit;
