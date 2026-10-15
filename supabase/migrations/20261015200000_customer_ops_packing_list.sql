-- Packing view for FCC operations: for every sent company batch, summarise the
-- meal totals per delivery date, company and delivery point, with member-level
-- detail (department, member, meal, quantity) for the packing list and labels.
create or replace function public.customer_portal_ops_packing_list(
  p_from date, p_to date, p_organization_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  perform private.customer_portal_ops_require(false);
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 45 then
    raise exception 'invalid_range';
  end if;
  return jsonb_build_object('days', coalesce((
    select jsonb_agg(jsonb_build_object(
      'service_date', g.service_date, 'organization_id', g.organization_id, 'organization_name', g.organization_name,
      'address_id', g.address_id, 'address_label', g.address_label,
      'total_quantity', g.total_quantity, 'lines', g.lines
    ) order by g.service_date, g.organization_name, g.address_label)
    from (
      select r.service_date, r.organization_id, o.name organization_name, r.address_id, a.label address_label,
        sum(rq.qty) total_quantity,
        jsonb_agg(jsonb_build_object('member_email', rq.email, 'department', rq.department, 'items', rq.items) order by rq.email) lines
      from customer_member_requests r
      join customer_organizations o on o.id = r.organization_id
      left join customer_addresses a on a.id = r.address_id
      join lateral (
        select u.email, m.department,
          (select coalesce(sum(y.quantity), 0)::int from jsonb_to_recordset(r.items) y(product_id uuid, quantity integer)) qty,
          (select jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.chinese_name, ''), p.name), 'quantity', y.quantity))
             from jsonb_to_recordset(r.items) y(product_id uuid, quantity integer)
             left join products p on p.id = y.product_id) items
        from auth.users u
        left join customer_memberships m on m.user_id = u.id and m.organization_id = r.organization_id
        where u.id = r.member_id
      ) rq on true
      where r.status = 'sent' and r.service_date between p_from and p_to
        and (p_organization_id is null or r.organization_id = p_organization_id)
      group by r.service_date, r.organization_id, o.name, r.address_id, a.label
    ) g
  ), '[]'::jsonb));
end $$;
revoke all on function public.customer_portal_ops_packing_list(date,date,uuid) from public,anon;
grant execute on function public.customer_portal_ops_packing_list(date,date,uuid) to authenticated;
