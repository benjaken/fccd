-- Per-order, user-managed follow-up labels used by the enhanced order list.
-- System-derived to-dos (payment and factory dispatch) remain calculated from
-- orders and are deliberately not stored here.

create table if not exists public.order_list_manual_todos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  todo_key text not null check (
    todo_key in (
      'reschedule-pending', 'lwp', 'lbw', 'lfp', 'klook', 'alipay',
      'cancelled', 'monthly-settlement'
    )
  ),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (order_id, todo_key)
);

create index if not exists order_list_manual_todos_order_id_idx
  on public.order_list_manual_todos(order_id);
create index if not exists order_list_manual_todos_key_order_id_idx
  on public.order_list_manual_todos(todo_key, order_id);

alter table public.order_list_manual_todos enable row level security;

drop policy if exists "Order list readers read manual todos" on public.order_list_manual_todos;
create policy "Order list readers read manual todos"
on public.order_list_manual_todos for select to authenticated
using (private.has_page_access('orders'));

drop policy if exists "Order list managers create manual todos" on public.order_list_manual_todos;
create policy "Order list managers create manual todos"
on public.order_list_manual_todos for insert to authenticated
with check (
  private.has_page_manage('orders')
  and created_by = (select auth.uid())
);

drop policy if exists "Order list managers delete manual todos" on public.order_list_manual_todos;
create policy "Order list managers delete manual todos"
on public.order_list_manual_todos for delete to authenticated
using (private.has_page_manage('orders'));

create or replace function public.order_list_manual_todos_set_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by := coalesce(new.created_by, (select auth.uid()));
  return new;
end;
$$;

drop trigger if exists order_list_manual_todos_set_created_by on public.order_list_manual_todos;
create trigger order_list_manual_todos_set_created_by
before insert on public.order_list_manual_todos
for each row execute function public.order_list_manual_todos_set_created_by();
