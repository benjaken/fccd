create or replace function public.customer_reward_catalog()
returns jsonb language plpgsql stable security definer set search_path=public, private, pg_temp as $$
begin
  perform private.customer_personal_user();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'kind', kind, 'points_cost', points_cost, 'description', description, 'stock', stock,
    'voucher_amount_hkd', voucher_amount_hkd, 'image_object_path', image_object_path
  ) order by points_cost, name) from customer_reward_catalog where is_active), '[]');
end $$;
