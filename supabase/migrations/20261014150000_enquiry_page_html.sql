-- Each published enquiry page can carry staff-edited HTML above the questions.
alter table public.enquiry_forms
  add column if not exists page_html text not null default '';

alter table public.enquiry_forms
  drop constraint if exists enquiry_forms_page_html_length;
alter table public.enquiry_forms
  add constraint enquiry_forms_page_html_length
  check (octet_length(page_html) <= 100000);

create or replace function public.get_published_enquiry_form(p_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.enquiry_forms;
  v_identifier text := nullif(btrim(coalesce(p_slug, '')), '');
  v_id uuid;
begin
  if v_identifier is not null
    and v_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    v_id := v_identifier::uuid;
    select * into v_row
    from public.enquiry_forms
    where status = 'published' and id = v_id
    limit 1;
  elsif v_identifier is not null then
    select * into v_row
    from public.enquiry_forms
    where status = 'published' and slug = v_identifier
    limit 1;
  else
    select * into v_row
    from public.enquiry_forms
    where status = 'published' and is_default
    order by updated_at desc
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'internal_name', v_row.internal_name,
    'public_title', v_row.public_title,
    'public_description', v_row.public_description,
    'page_html', v_row.page_html,
    'submit_label', v_row.submit_label,
    'slug', v_row.slug,
    'is_default', v_row.is_default,
    'status', v_row.status,
    'success_message', v_row.success_message,
    'ack_email_subject', '',
    'ack_email_body', '',
    'asana_project_gid', '',
    'questions', v_row.questions,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.get_published_enquiry_form(text) from public;
grant execute on function public.get_published_enquiry_form(text) to anon, authenticated;
