-- Manage quote/order lookup options from the Order Settings page while keeping
-- the existing lookup records and dictionary values used by quote documents.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'quote_sales_sources',
    'quote_communication_channels',
    'festivals'
  ]
  loop
    execute format(
      'create policy "Order settings managers insert %1$s" on public.%1$I for insert to authenticated with check (private.has_page_manage(''orders.settings''))',
      table_name
    );
    execute format(
      'create policy "Order settings managers update %1$s" on public.%1$I for update to authenticated using (private.has_page_manage(''orders.settings'')) with check (private.has_page_manage(''orders.settings''))',
      table_name
    );
  end loop;
end;
$$;

create policy "Order settings managers insert quote dictionaries"
on public.dict_items
for insert to authenticated
with check (
  private.has_page_manage('orders.settings')
  and exists (
    select 1
    from public.dict_types
    where dict_types.id = dict_items.dict_type_id
      and dict_types.code in ('quote_term_template', 'quote_payment_template')
  )
);

create policy "Order settings managers update quote dictionaries"
on public.dict_items
for update to authenticated
using (
  private.has_page_manage('orders.settings')
  and exists (
    select 1
    from public.dict_types
    where dict_types.id = dict_items.dict_type_id
      and dict_types.code in ('quote_term_template', 'quote_payment_template')
  )
)
with check (
  private.has_page_manage('orders.settings')
  and exists (
    select 1
    from public.dict_types
    where dict_types.id = dict_items.dict_type_id
      and dict_types.code in ('quote_term_template', 'quote_payment_template')
  )
);
