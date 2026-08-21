alter table public.orders
  add column if not exists do_not_send_to_factory boolean not null default false;

comment on column public.orders.do_not_send_to_factory is
  'When true, this order is intentionally excluded from the factory workflow. Independent of is_sent_to_factory, which records whether it has actually been sent.';
