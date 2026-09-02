-- Parameter-count changes create new PostgreSQL overloads; they do not replace
-- the previous function signatures. Remove the obsolete overloads so PostgREST
-- can resolve list_quote_customers unambiguously to the 7-argument function.
drop function if exists public.list_quote_customers(text, text, boolean, integer, integer);
drop function if exists public.list_quote_customers(text, text, boolean, integer, integer, boolean);

-- Ask PostgREST to rebuild its function schema cache immediately.
notify pgrst, 'reload schema';
