alter table public.order_timeline_entries
  add column if not exists author_name_snapshot text;

create index if not exists order_timeline_entries_email_idx
  on public.order_timeline_entries (lower(btrim(customer_email_snapshot)));
