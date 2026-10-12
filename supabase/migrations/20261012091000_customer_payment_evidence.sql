create table public.customer_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  organization_id uuid not null references public.customer_organizations(id),
  created_by uuid not null references auth.users(id),
  object_path text not null unique,
  amount numeric(14,2) not null check (amount>0),
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  review_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  payment_id uuid references public.payments(id),
  created_at timestamptz not null default now()
);
alter table public.customer_payment_evidence enable row level security;
revoke all on public.customer_payment_evidence from anon,authenticated;
grant all on public.customer_payment_evidence to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-payment-evidence','customer-payment-evidence',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do nothing;

create function private.customer_receipt_path_allowed(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_parts text[]:=string_to_array(p_path,'/');
begin
  return array_length(v_parts,1)=3 and v_parts[1]=auth.uid()::text and exists(
    select 1 from customer_portal_orders where organization_id=v_org and order_id::text=v_parts[2]);
end $$;
revoke all on function private.customer_receipt_path_allowed(text) from public,anon;
grant execute on function private.customer_receipt_path_allowed(text) to authenticated;
create policy "Customer receipt uploads" on storage.objects for insert to authenticated
with check(bucket_id='customer-payment-evidence' and private.customer_receipt_path_allowed(name));
create policy "Customer receipt reads" on storage.objects for select to authenticated
using(bucket_id='customer-payment-evidence' and private.customer_receipt_path_allowed(name));

create function public.customer_portal_submit_evidence(p_order_id uuid,p_path text,p_amount numeric)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization();
begin
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'invalid_payment_amount'; end if;
  if not private.customer_receipt_path_allowed(p_path) or split_part(p_path,'/',2) is distinct from p_order_id::text
    or not exists(select 1 from storage.objects where bucket_id='customer-payment-evidence' and name=p_path)
    or not exists(select 1 from orders where id=p_order_id and outstanding>0 and archived_at is null
       and coalesce(delivery_status,'') not in ('已取消','己取消','取消')) then raise exception 'invalid_payment_evidence'; end if;
  insert into customer_payment_evidence(order_id,organization_id,created_by,object_path,amount)
    values(p_order_id,v_org,auth.uid(),p_path,p_amount) on conflict(object_path) do nothing;
end $$;
revoke all on function public.customer_portal_submit_evidence(uuid,text,numeric) from public,anon;
grant execute on function public.customer_portal_submit_evidence(uuid,text,numeric) to authenticated;

-- Financial review is backend-only and creates a payment once, never on upload.
create function public.customer_portal_review_evidence(p_id uuid,p_accept boolean,p_reason text,p_method_id uuid,p_reviewer uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_e public.customer_payment_evidence%rowtype; v_payment uuid:=gen_random_uuid();
begin
  select * into v_e from customer_payment_evidence where id=p_id for update;
  if v_e.id is null then raise exception 'evidence_not_found'; end if;
  if v_e.status<>'pending' then return; end if;
  if p_accept is null or p_reviewer is null then raise exception 'review_required'; end if;
  if not p_accept and nullif(btrim(p_reason),'') is null then raise exception 'review_reason_required'; end if;
  if p_accept then
    if not exists(select 1 from payment_methods where id=p_method_id and is_active and archived_at is null) then raise exception 'payment_method_required'; end if;
    perform 1 from orders where id=v_e.order_id for update;
    insert into payments(id,legacy_id,order_id,channel_id,payment_method_id,order_number_snapshot,currency,amount,payment_at)
      select v_payment,'customer-evidence-'||v_e.id,o.id,o.channel_id,p_method_id,o.order_number,o.currency,v_e.amount,now()
      from orders o where o.id=v_e.order_id;
    perform private.recalculate_quote_total(v_e.order_id);
  end if;
  update customer_payment_evidence set status=case when p_accept then 'accepted' else 'rejected' end,
    review_reason=p_reason,reviewed_by=p_reviewer,reviewed_at=now(),payment_id=case when p_accept then v_payment end where id=p_id;
end $$;
revoke all on function public.customer_portal_review_evidence(uuid,boolean,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_portal_review_evidence(uuid,boolean,text,uuid,uuid) to service_role;

create function public.customer_portal_evidence()
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'amount',amount,'status',status,
  'review_reason',review_reason,'created_at',created_at) order by created_at desc),'[]')
from customer_payment_evidence where organization_id=private.customer_organization()
$$;
revoke all on function public.customer_portal_evidence() from public,anon;
grant execute on function public.customer_portal_evidence() to authenticated;
