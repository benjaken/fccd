-- Admin may change the menu (meal) of a not-yet-sent member request, not only the
-- quantities. Items, service date bounds and the food amount are re-validated
-- against the chosen menu, and the change is recorded.
drop function if exists public.customer_portal_update_member_request(uuid,jsonb,date,uuid);
create or replace function public.customer_portal_update_member_request(
  p_id uuid, p_items jsonb, p_service_date date, p_address_id uuid, p_menu_id uuid default null
) returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_org uuid:=private.customer_organization(); v_req customer_member_requests%rowtype; v_menu customer_menu_assignments%rowtype;
  v_menu_id uuid; v_day date;
begin
  perform private.customer_require_permission('ordering');
  if not private.customer_is_admin() then raise exception 'permission_denied'; end if;
  select * into v_req from customer_member_requests where id=p_id and organization_id=v_org and status='submitted' for update;
  if v_req.id is null then raise exception 'request_not_found'; end if;
  v_menu_id := coalesce(p_menu_id, v_req.menu_id);
  select * into v_menu from customer_menu_assignments
    where id=v_menu_id and organization_id=v_org and is_active and cutoff_at>now();
  if v_menu.id is null then raise exception 'menu_unavailable'; end if;
  v_day := coalesce(p_service_date, v_req.service_date);
  if v_day < v_menu.delivery_date or v_day > v_menu.valid_until then raise exception 'delivery_date_unavailable'; end if;
  if p_address_id is not null and not exists(select 1 from customer_addresses where id=p_address_id and organization_id=v_org and archived_at is null) then
    raise exception 'address_required';
  end if;
  if not private.customer_member_request_items_valid(v_menu_id, p_items) then raise exception 'cart_unavailable'; end if;
  update customer_member_requests
    set menu_id=v_menu_id, items=p_items, service_date=v_day, address_id=coalesce(p_address_id,address_id),
        food_amount=private.customer_member_request_amount(v_menu_id, p_items), updated_at=now()
    where id=p_id;
  insert into customer_member_request_events(organization_id,request_id,actor_id,action,detail)
    values(v_org,p_id,auth.uid(),'update',jsonb_build_object('menu_id',v_menu_id,'items',p_items,'service_date',v_day));
end $$;
revoke all on function public.customer_portal_update_member_request(uuid,jsonb,date,uuid,uuid) from public,anon;
grant execute on function public.customer_portal_update_member_request(uuid,jsonb,date,uuid,uuid) to authenticated;
