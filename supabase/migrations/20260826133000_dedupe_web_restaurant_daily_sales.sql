-- Remove Bubble copies of restaurant/day records already entered in FCCD,
-- skip future Bubble inserts for those days, and keep a single control-total
-- row per restaurant Hong Kong business day.

delete from public.restaurant_daily_sales bubble
using public.restaurant_daily_sales web
where web.legacy_id like 'web-daily-sales-%'
  and bubble.legacy_id not like 'web-daily-sales-%'
  and bubble.restaurant_id is not null
  and web.restaurant_id is not null
  and bubble.restaurant_id = web.restaurant_id
  and bubble.sales_at is not null
  and web.sales_at is not null
  and (bubble.sales_at at time zone 'Asia/Hong_Kong')::date
    = (web.sales_at at time zone 'Asia/Hong_Kong')::date;

create or replace function public.skip_bubble_daily_sales_when_web_exists()
returns trigger
language plpgsql
as $$
begin
  if new.legacy_id like 'web-daily-sales-%' then
    return new;
  end if;
  if new.restaurant_id is not null
    and new.sales_at is not null
    and exists (
      select 1
      from public.restaurant_daily_sales web
      where web.legacy_id like 'web-daily-sales-%'
        and web.restaurant_id = new.restaurant_id
        and web.sales_at is not null
        and (web.sales_at at time zone 'Asia/Hong_Kong')::date
          = (new.sales_at at time zone 'Asia/Hong_Kong')::date
    )
  then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_daily_sales_skip_bubble_when_web
  on public.restaurant_daily_sales;
create trigger restaurant_daily_sales_skip_bubble_when_web
  before insert on public.restaurant_daily_sales
  for each row
  execute function public.skip_bubble_daily_sales_when_web_exists();

create unique index if not exists restaurant_daily_sales_one_control_per_restaurant_day_idx
  on public.restaurant_daily_sales (
    restaurant_id,
    ((sales_at at time zone 'Asia/Hong_Kong')::date)
  )
  where is_control_total
    and restaurant_id is not null
    and sales_at is not null;
