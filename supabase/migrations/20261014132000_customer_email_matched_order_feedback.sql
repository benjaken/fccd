-- Include historical personal orders claimed by verified email, without granting any new account access.
create or replace function private.customer_order_feedback_enqueue(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_email text; v_number text; v_token text;
begin
  select lower(btrim(email_snapshot)), coalesce(nullif(btrim(order_number),''), id::text)
    into v_email, v_number
  from orders
  where id=p_order_id and document_type='order' and archived_at is null
    and delivery_status in ('已送達','己送達','已取','已取貨');
  if v_number is null then return; end if;
  if not exists(select 1 from customer_portal_orders where order_id=p_order_id)
    and not exists(select 1 from customer_personal_quotes where order_id=p_order_id)
    and not exists(select 1 from private.customer_personal_order_links where order_id=p_order_id)
    and not exists(select 1 from orders o join auth.users u on lower(btrim(u.email))=v_email
      where o.id=p_order_id and u.email_confirmed_at is not null
        and private.personal_email_matches_order(o,u.email)) then return; end if;
  if exists(select 1 from customer_order_feedback where order_id=p_order_id) then return; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into customer_order_feedback(order_id, token_hash) values(p_order_id, md5(v_token));
  if v_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    insert into customer_order_feedback_email_outbox(order_id, recipient, order_number, token)
      values(p_order_id, v_email, v_number, v_token);
  end if;
end $$;
revoke all on function private.customer_order_feedback_enqueue(uuid) from public, anon, authenticated;

