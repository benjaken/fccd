do $$
declare
  populated_table text;
  has_rows boolean;
begin
  foreach populated_table in array array[
    'osdriver_menus',
    'print_labels',
    'product_tag_links',
    'product_tags'
  ]
  loop
    execute format(
      'select exists (select 1 from public.%I limit 1)',
      populated_table
    ) into has_rows;

    if has_rows then
      raise exception 'Refusing to retire populated table public.%', populated_table;
    end if;
  end loop;
end
$$;

drop table public.product_tag_links;
drop table public.product_tags;
drop table public.print_labels;
drop table public.osdriver_menus;
