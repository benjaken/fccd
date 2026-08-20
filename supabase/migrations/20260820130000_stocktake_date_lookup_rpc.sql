-- Return the date selector data without downloading every stocktake-event row.
-- Both consumers need one result per Hong Kong stocktake date and the most
-- recent change for that date; the prior client-side implementation fetched
-- every event in batches of 1,000 just to calculate this same result.

create or replace function public.get_stocktake_dates(p_kind text)
returns table (stocktake_date date, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_kind not in ('packing', 'ingredient') then
    raise exception 'invalid_stocktake_kind';
  end if;

  return query
  select
    event_date.stocktake_date,
    max(event_date.updated_at) as updated_at
  from (
    select
      (event.stocktake_at at time zone 'Asia/Hong_Kong')::date as stocktake_date,
      coalesce(event.updated_at, event.stocktake_at) as updated_at
    from public.packing_stocktake_events event
    where p_kind = 'packing'
      and event.stocktake_at is not null

    union all

    select
      (event.stocktake_at at time zone 'Asia/Hong_Kong')::date as stocktake_date,
      coalesce(event.updated_at, event.stocktake_at) as updated_at
    from public.ingredient_stocktake_events event
    where p_kind = 'ingredient'
      and event.stocktake_at is not null
  ) event_date
  group by event_date.stocktake_date
  order by event_date.stocktake_date desc;
end;
$$;

revoke all on function public.get_stocktake_dates(text) from public, anon;
grant execute on function public.get_stocktake_dates(text) to authenticated;
