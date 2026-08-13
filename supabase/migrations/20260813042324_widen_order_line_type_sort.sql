alter table public.order_lines
  alter column type_sort type numeric(14, 3)
  using type_sort::numeric(14, 3);

comment on column public.order_lines.type_sort is
  'Bubble TypeSort supports fractional ordering values such as 11.5.';
