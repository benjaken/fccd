-- The 20260908230000 replace missed production/develop because pg_get_functiondef
-- pretty-prints with different whitespace than `or payment.amount <= 0`.
-- Refunds stay negative; still reject null and zero amounts.
do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.save_sales_document_batch(uuid,text,jsonb,numeric,numeric,numeric,numeric,jsonb,uuid,text,jsonb)'::regprocedure
  )
  into v_definition;

  v_updated_definition := regexp_replace(
    v_definition,
    'payment\.amount\s*<=\s*0',
    'payment.amount = 0',
    'g'
  );

  if v_updated_definition = v_definition then
    raise exception 'save_sales_document_batch payment validation was not found';
  end if;

  execute v_updated_definition;
end;
$$;
