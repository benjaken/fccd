-- Restaurant-ordering warehouse receipts are for purchased dry goods only.
-- Frozen raw meat and prepared meat use their dedicated stock-in/production flows.

create or replace function private.enforce_shop_warehouse_receipt_dry_goods()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.warehouse <> 'dry' then
    raise exception 'warehouse receipts only accept dry goods; prepared meat must be produced from frozen raw meat'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists shop_warehouse_receipts_dry_goods_only
  on public.shop_warehouse_receipts;

create trigger shop_warehouse_receipts_dry_goods_only
before insert or update of warehouse on public.shop_warehouse_receipts
for each row
execute function private.enforce_shop_warehouse_receipt_dry_goods();

comment on function private.enforce_shop_warehouse_receipt_dry_goods() is
  'Keeps purchased dry-goods receipts separate from frozen-meat production movements.';
