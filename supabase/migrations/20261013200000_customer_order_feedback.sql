-- One feedback record per completed portal order. The email carries the only copy of the token.

create table if not exists public.customer_order_feedback (
  order_id uuid primary key references public.orders(id),
  token_hash text not null unique,
  comment text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((comment is null) = (submitted_at is null)),
  check (comment is null or char_length(comment) between 1 and 2000)
);
create table if not exists public.customer_order_feedback_email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  recipient text not null,
  order_number text not null,
  token text not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.customer_order_feedback enable row level security;
alter table public.customer_order_feedback_email_outbox enable row level security;
revoke all on public.customer_order_feedback, public.customer_order_feedback_email_outbox from public, anon, authenticated;
grant all on public.customer_order_feedback, public.customer_order_feedback_email_outbox to service_role;

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
    and not exists(select 1 from private.customer_personal_order_links where order_id=p_order_id) then return; end if;
  if exists(select 1 from customer_order_feedback where order_id=p_order_id) then return; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into customer_order_feedback(order_id, token_hash) values(p_order_id, md5(v_token));
  if v_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    insert into customer_order_feedback_email_outbox(order_id, recipient, order_number, token)
      values(p_order_id, v_email, v_number, v_token);
  end if;
end $$;
revoke all on function private.customer_order_feedback_enqueue(uuid) from public, anon, authenticated;

create or replace function private.customer_order_feedback_view(p_order_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'order_number', coalesce(nullif(btrim(o.order_number),''), o.id::text),
    'delivery_at', o.delivery_at,
    'comment', f.comment,
    'submitted', f.submitted_at is not null
  )
  from customer_order_feedback f join orders o on o.id=f.order_id
  where f.order_id=p_order_id and o.archived_at is null
$$;
revoke all on function private.customer_order_feedback_view(uuid) from public, anon, authenticated;

create or replace function public.customer_order_feedback_open(p_token text)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_order uuid; v_view jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'feedback_unavailable' using errcode='P0001'; end if;
  select order_id into v_order from customer_order_feedback where token_hash=md5(p_token);
  v_view := private.customer_order_feedback_view(v_order);
  if v_view is null then raise exception 'feedback_unavailable' using errcode='P0001'; end if;
  return v_view;
end $$;
revoke all on function public.customer_order_feedback_open(text) from public;
grant execute on function public.customer_order_feedback_open(text) to anon, authenticated;

create or replace function public.customer_order_feedback_submit(p_token text, p_comment text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_comment text := btrim(coalesce(p_comment,'')); v_order uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'feedback_unavailable' using errcode='P0001'; end if;
  if char_length(v_comment) not between 1 and 2000 then raise exception 'feedback_required' using errcode='P0001'; end if;
  update customer_order_feedback set comment=v_comment, submitted_at=now()
    where token_hash=md5(p_token) and submitted_at is null
    returning order_id into v_order;
  if v_order is null then
    if exists(select 1 from customer_order_feedback where token_hash=md5(p_token) and submitted_at is not null)
      then raise exception 'feedback_already_submitted' using errcode='P0001'; end if;
    raise exception 'feedback_unavailable' using errcode='P0001';
  end if;
  return private.customer_order_feedback_view(v_order);
end $$;
revoke all on function public.customer_order_feedback_submit(text, text) from public;
grant execute on function public.customer_order_feedback_submit(text, text) to anon, authenticated;

create or replace function private.customer_order_feedback_allowed(p_order_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
begin
  if auth.uid() is null then return false; end if;
  if private.customer_personal_owns_order(p_order_id) then return true; end if;
  return exists(
    select 1 from customer_portal_orders po
    join customer_memberships m on m.organization_id=po.organization_id
    where po.order_id=p_order_id and m.user_id=auth.uid() and m.is_active
  );
end $$;
revoke all on function private.customer_order_feedback_allowed(uuid) from public, anon, authenticated;

create or replace function public.customer_portal_order_feedback(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_view jsonb;
begin
  if not private.customer_order_feedback_allowed(p_order_id) then raise exception 'feedback_unavailable' using errcode='P0001'; end if;
  v_view := private.customer_order_feedback_view(p_order_id);
  return v_view;
end $$;
revoke all on function public.customer_portal_order_feedback(uuid) from public;
grant execute on function public.customer_portal_order_feedback(uuid) to authenticated;

create or replace function public.customer_portal_order_feedback_submit(p_order_id uuid, p_comment text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_comment text := btrim(coalesce(p_comment,'')); v_order uuid;
begin
  if not private.customer_order_feedback_allowed(p_order_id) then raise exception 'feedback_unavailable' using errcode='P0001'; end if;
  if char_length(v_comment) not between 1 and 2000 then raise exception 'feedback_required' using errcode='P0001'; end if;
  update customer_order_feedback set comment=v_comment, submitted_at=now()
    where order_id=p_order_id and submitted_at is null
    returning order_id into v_order;
  if v_order is null then
    if exists(select 1 from customer_order_feedback where order_id=p_order_id and submitted_at is not null)
      then raise exception 'feedback_already_submitted' using errcode='P0001'; end if;
    raise exception 'feedback_unavailable' using errcode='P0001';
  end if;
  return private.customer_order_feedback_view(p_order_id);
end $$;
revoke all on function public.customer_portal_order_feedback_submit(uuid, text) from public;
grant execute on function public.customer_portal_order_feedback_submit(uuid, text) to authenticated;

create or replace function public.claim_customer_order_feedback_emails(p_limit integer default 20)
returns setof customer_order_feedback_email_outbox language sql security definer set search_path=public,pg_temp as $$
  update customer_order_feedback_email_outbox set status='processing', attempts=attempts+1, locked_at=now()
    where id in (select id from customer_order_feedback_email_outbox where attempts<5 and
      ((status='pending' and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '10 minutes'))
      order by next_attempt_at for update skip locked limit greatest(1,least(p_limit,100))) returning *
$$;
revoke all on function public.claim_customer_order_feedback_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_customer_order_feedback_emails(integer) to service_role;

create or replace function private.customer_portal_completion_trigger()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if new.delivery_status in ('已送達','己送達','已取','已取貨') and new.delivery_status is distinct from old.delivery_status then
    perform public.customer_portal_award_completed_order(new.id);
    perform public.customer_personal_award_completed_order(new.id);
    perform private.customer_order_feedback_enqueue(new.id);
  elsif new.delivery_status in ('已取消','己取消','取消') and new.delivery_status is distinct from old.delivery_status then
    perform public.customer_portal_clawback_order(new.id);
    perform public.customer_personal_clawback_order(new.id);
  end if;
  return new;
end $$;
