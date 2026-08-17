-- Trim leftover spaces on migrated Bubble SKUs so A-Z catalog sort is correct.
-- Example: ' KRIC04-3' currently sorts above 'CAC001' because a leading space
-- comes before 'C'.

update public.products
set sku = btrim(sku)
where sku is not null
  and sku <> btrim(sku);
