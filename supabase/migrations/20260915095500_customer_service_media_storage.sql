insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-service-media',
  'customer-service-media',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No object policies are added: only the service-role webhook may mirror files.
-- Staff receive short-lived signed URLs rather than public WATI or Storage URLs.
