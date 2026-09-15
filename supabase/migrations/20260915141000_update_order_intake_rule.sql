create or replace function public.update_order_intake_rule(
  p_rule_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_start_time time default null,
  p_end_time time default null,
  p_handling text default 'manual_review',
  p_addon_handling text default 'manual_review',
  p_customer_message text default null,
  p_internal_note text default null,
  p_channels jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.has_page_manage('orders.settings.addon_block_dates') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_channels, '[]'::jsonb)) <> 'array' then
    raise exception 'channels_must_be_array' using errcode = '22023';
  end if;

  if p_handling = 'allow_only' and jsonb_array_length(coalesce(p_channels, '[]'::jsonb)) = 0 then
    raise exception 'allowed_channel_required' using errcode = '22023';
  end if;

  update public.order_intake_rules
  set name = btrim(p_name),
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      start_time = p_start_time,
      end_time = p_end_time,
      handling = p_handling,
      addon_handling = p_addon_handling,
      customer_message = nullif(btrim(p_customer_message), ''),
      internal_note = nullif(btrim(p_internal_note), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_rule_id
    and archived_at is null;

  if not found then
    raise exception 'order_intake_rule_not_found' using errcode = 'P0002';
  end if;

  delete from public.order_intake_rule_channels
  where rule_id = p_rule_id;

  insert into public.order_intake_rule_channels (
    rule_id,
    channel_id,
    brand_terms,
    product_terms,
    recommendation_url
  )
  select
    p_rule_id,
    (channel ->> 'channelId')::uuid,
    coalesce(array(select jsonb_array_elements_text(coalesce(channel -> 'brandTerms', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(channel -> 'productTerms', '[]'::jsonb))), '{}'),
    nullif(btrim(channel ->> 'recommendationUrl'), '')
  from jsonb_array_elements(coalesce(p_channels, '[]'::jsonb)) channel;
end;
$$;

revoke all on function public.update_order_intake_rule(
  uuid, text, date, date, time, time, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.update_order_intake_rule(
  uuid, text, date, date, time, time, text, text, text, text, jsonb
) to authenticated, service_role;
