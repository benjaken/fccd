-- Submitted BR versions are immutable, including uploads from stale clients.
-- RLS users cannot read the version table directly. Keep the lookup behind a scoped predicate.
create or replace function private.customer_br_object_mutable(p_path text)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select private.customer_br_upload_allowed(p_path)
    and not exists(select 1 from customer_organization_br_versions where object_path=p_path)
$$;
revoke all on function private.customer_br_object_mutable(text) from public,anon;
grant execute on function private.customer_br_object_mutable(text) to authenticated;
drop policy if exists "Customer BR document updates" on storage.objects;
create policy "Customer BR document updates" on storage.objects for update to authenticated
  using (bucket_id='customer-br-documents' and private.customer_br_object_mutable(name))
  with check (bucket_id='customer-br-documents' and private.customer_br_object_mutable(name));

create or replace function public.customer_portal_ops_application_page(p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_total bigint; v_page integer;
begin
  perform private.customer_portal_ops_require(false);
  select count(*) into v_total from customer_organization_applications;
  v_page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(v_total/15.0)::integer));
  return jsonb_build_object('total',v_total,'page',v_page,'rows',coalesce((
    select jsonb_agg(row_data order by updated_at desc,id desc) from (
      select a.id,a.updated_at,jsonb_build_object(
        'id',a.id,'company_name',a.company_name,'status',a.status,'br_number',a.br_number,
        'br_expires_on',a.br_expires_on,'applicant_email',u.email,'organization_id',a.organization_id,
        'review_reason',a.review_reason,'updated_at',a.updated_at
      ) row_data
      from customer_organization_applications a join auth.users u on u.id=a.applicant_user_id
      order by a.updated_at desc,a.id desc limit 15 offset (v_page-1)*15
    ) page_rows),'[]'::jsonb));
end $$;
revoke all on function public.customer_portal_ops_application_page(integer) from public,anon;
grant execute on function public.customer_portal_ops_application_page(integer) to authenticated;
