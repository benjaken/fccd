-- Permissions: invoker conversion can reach the shared gate and read its quote.
begin;
insert into orders(id,document_type) values ('30000000-0000-0000-0000-000000000040','quote');
insert into orders(id,document_type,source_quote_id) values ('30000000-0000-0000-0000-000000000041','order','30000000-0000-0000-0000-000000000040');
set local role authenticated;
select pg_temp.assert_equal((select count(*) from public.convert_quote_to_order('30000000-0000-0000-0000-000000000040') where id='30000000-0000-0000-0000-000000000041'),1,'invoker RPC retains access to gate');
reset role;
set local test.authorized='false';
do $check$ begin
  begin
    perform public.save_sales_document_batch('30000000-0000-0000-0000-000000000040','quote','[]',0,0,0,0,'[]',null,null,'{}');
    raise exception 'expected sales document permission rejection';
  exception when insufficient_privilege then null;
  end;
end; $check$;
rollback;
