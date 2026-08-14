-- Speed up list pages ordered by original Bubble Created Date.
create index if not exists products_bubble_created_at_idx
  on public.products (bubble_created_at desc nulls last);

create index if not exists packages_bubble_created_at_idx
  on public.packages (bubble_created_at desc nulls last);

create index if not exists orders_bubble_created_at_idx
  on public.orders (bubble_created_at desc nulls last);

create index if not exists payments_bubble_created_at_idx
  on public.payments (bubble_created_at desc nulls last);

create index if not exists user_profiles_created_at_idx
  on public.user_profiles (created_at desc);
