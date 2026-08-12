insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

alter table public.attachments
  alter column bucket_id set default 'attachments';

update public.attachments
set bucket_id = 'attachments'
where bucket_id = 'bubble-attachments-private';
