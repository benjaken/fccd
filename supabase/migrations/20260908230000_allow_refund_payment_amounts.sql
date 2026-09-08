-- Refunds are recorded as negative payments. Keep rejecting missing and zero
-- amounts, while allowing the batch order editor to persist refund entries.
do $$
declare
  v_definition text;
  v_updated_definition text;
  v_old_validation text := 'or payment.amount ' || '<= 0';
begin
  select pg_get_functiondef(
    'public.save_sales_document_batch(uuid,text,jsonb,numeric,numeric,numeric,numeric,jsonb,uuid,text,jsonb)'::regprocedure
  )
  into v_definition;

  v_updated_definition := replace(
    v_definition,
    v_old_validation,
    'or payment.amount = 0'
  );

  if v_updated_definition = v_definition then
    raise exception 'save_sales_document_batch payment validation was not found';
  end if;

  execute v_updated_definition;
end;
$$;
