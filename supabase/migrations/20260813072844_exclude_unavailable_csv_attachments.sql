alter table public.attachments
  drop constraint attachments_migration_status_check;

alter table public.attachments
  add constraint attachments_migration_status_check
  check (
    migration_status in (
      'discovered',
      'enriched',
      'uploaded',
      'verified',
      'failed',
      'excluded'
    )
  );

do $$
declare
  target_count bigint;
begin
  select count(*)
    into target_count
  from public.attachments
  where source_type = 'bubble_uploaded_file'
    and migration_status = 'failed'
    and last_error_code = 'http_403'
    and mime_type = 'text/csv';

  if target_count <> 54 then
    raise exception
      'Expected 54 unavailable CSV attachments, found %',
      target_count;
  end if;

  update public.attachments
  set migration_status = 'excluded',
      last_error_code = 'accepted_unavailable_csv',
      updated_at = now()
  where source_type = 'bubble_uploaded_file'
    and migration_status = 'failed'
    and last_error_code = 'http_403'
    and mime_type = 'text/csv';
end
$$;

comment on constraint attachments_migration_status_check
  on public.attachments is
  'excluded means the source file was explicitly accepted outside migration scope; no Storage object is fabricated.';
