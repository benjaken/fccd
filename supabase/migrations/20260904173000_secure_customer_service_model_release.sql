-- Keep model evaluation and release behind FAQ edit permission, and require a
-- completed historical evaluation before a candidate can become active.

create or replace function public.customer_service_edit_access_check()
returns boolean
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  return true;
end;
$$;

create or replace function public.customer_service_config_activate(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public, private
as $$
declare v_environment text;
begin
  if not private.has_page_access('settings.customer_faq.edit') then
    raise exception 'page_access_required' using errcode = '42501';
  end if;
  select environment into v_environment
  from public.customer_service_config_versions where id = p_id for update;
  if not found then raise exception 'config_not_found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.customer_service_evaluation_runs r
    where r.candidate_config_id = p_id and r.status = 'complete' and r.sample_size > 0
  ) then
    raise exception 'completed_evaluation_required' using errcode = '55000';
  end if;
  update public.customer_service_config_versions set status = 'archived', updated_at = now()
    where environment = v_environment and status = 'active' and id <> p_id;
  update public.customer_service_config_versions set status = 'active', activated_by = auth.uid(),
    activated_at = now(), updated_at = now() where id = p_id;
  return p_id;
end;
$$;

revoke all on function public.customer_service_edit_access_check() from public, anon;
grant execute on function public.customer_service_edit_access_check() to authenticated;
