create index bubble_incremental_checkpoints_run_idx
  on public.bubble_incremental_checkpoints (last_successful_run_id)
  where last_successful_run_id is not null;
