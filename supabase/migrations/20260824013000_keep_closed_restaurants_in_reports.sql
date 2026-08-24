-- Closing a restaurant stops it from appearing in restaurant data-entry
-- screens, but must not hide its historical data from reports.
--
-- Keep the current report implementations intact and remove only their
-- restaurant active-state predicates. Using pg_get_functiondef here avoids
-- copying several long report functions and accidentally letting those copies
-- drift from their latest definitions earlier in the migration chain.

do $migration$
declare
  function_signature text;
  current_definition text;
  updated_definition text;
begin
  foreach function_signature in array array[
    'public.report_restaurant_sales_salary(date,date,uuid[])',
    'public.report_restaurant_sales_cost(date,date,uuid)',
    'public.report_restaurant_pnl(date,date,uuid)'
  ] loop
    current_definition := pg_get_functiondef(
      to_regprocedure(function_signature)
    );

    -- The salary report starts its selected-restaurants predicate with the
    -- active check; the single-restaurant reports add it after the id check.
    updated_definition := regexp_replace(
      current_definition,
      'where[[:space:]]+restaurant\.is_active[[:space:]]+and[[:space:]]+restaurant\.archived_at is null',
      'where restaurant.archived_at is null'
    );
    updated_definition := regexp_replace(
      updated_definition,
      '[[:space:]]+and[[:space:]]+restaurant\.is_active',
      '',
      'g'
    );

    if updated_definition = current_definition then
      raise exception
        'Could not remove active restaurant filter from %',
        function_signature;
    end if;

    execute updated_definition;
  end loop;
end
$migration$;
