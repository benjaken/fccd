-- Repair active deliveries whose Bubble fleet reference was retained but whose
-- UUID foreign key was not resolved. These rows were counted as unassigned even
-- though Bubble already had a fleet assignment.
update public.deliveries as delivery
set
  motorcade_id = team.id,
  updated_at = now()
from public.delivery_teams as team
where delivery.motorcade_id is null
  and delivery.motorcade_legacy_id = team.legacy_id
  and delivery.subdriver_id is null
  and delivery.fulfilled_at is null
  and delivery.order_id is not null;
