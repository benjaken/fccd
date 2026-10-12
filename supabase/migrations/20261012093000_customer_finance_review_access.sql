-- Finance review uses staff roles, never a membership flag or client-supplied reviewer.
create function public.customer_portal_review_queue()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  if not exists(select 1 from user_profiles where id=auth.uid() and role in ('Super Admin','Admin','Accounting')) then
    raise exception 'finance_access_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'methods',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from payment_methods where is_active and archived_at is null),'[]'),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'order_number',o.order_number,'organization',g.name,
      'amount',e.amount,'created_at',e.created_at,'object_path',e.object_path))
      from customer_payment_evidence e join orders o on o.id=e.order_id join customer_organizations g on g.id=e.organization_id
      where e.status='pending'),'[]')
  );
end $$;
create function public.customer_portal_finance_review(p_id uuid,p_accept boolean,p_reason text,p_method_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if not exists(select 1 from user_profiles where id=auth.uid() and role in ('Super Admin','Admin','Accounting')) then
    raise exception 'finance_access_required' using errcode='42501';
  end if;
  perform public.customer_portal_review_evidence(p_id,p_accept,p_reason,p_method_id,auth.uid());
end $$;
revoke all on function public.customer_portal_review_queue() from public,anon;
revoke all on function public.customer_portal_finance_review(uuid,boolean,text,uuid) from public,anon;
grant execute on function public.customer_portal_review_queue() to authenticated;
grant execute on function public.customer_portal_finance_review(uuid,boolean,text,uuid) to authenticated;
create function private.customer_portal_is_finance()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from user_profiles where id=auth.uid() and role in ('Super Admin','Admin','Accounting'))
$$;
revoke all on function private.customer_portal_is_finance() from public,anon;
grant execute on function private.customer_portal_is_finance() to authenticated;
create policy "Finance reads customer evidence" on storage.objects for select to authenticated
using(bucket_id='customer-payment-evidence' and private.customer_portal_is_finance());
