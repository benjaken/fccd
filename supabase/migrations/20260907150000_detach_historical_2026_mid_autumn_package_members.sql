-- Remove only genuinely ungrouped historical members from the seven reused
-- 2026 Mid-Autumn package masters. Choice sets created in 2025 are retained:
-- several were intentionally reused and received new 2026 members.
--
-- The restoration branch repairs databases where an earlier direct cleanup
-- detached those reused choice sets. All historical rows remain available for
-- order audit because this migration only changes their package_id linkage.
do $$
declare
  v_target_package_ids uuid[];
  v_target_package_legacy_ids text[];
  v_target_package_count integer;
  v_choice_sets_to_restore integer;
  v_grouped_members_to_restore integer;
  v_ungrouped_members_to_detach integer;
  v_remaining_member_count integer;
  v_remaining_choice_set_count integer;
  v_remaining_ungrouped_count integer;
begin
  select
    array_agg(pkg.id order by pkg.sku),
    array_agg(pkg.legacy_id order by pkg.sku),
    count(*)
  into
    v_target_package_ids,
    v_target_package_legacy_ids,
    v_target_package_count
  from public.packages pkg
  where pkg.archived_at is null
    and pkg.sku = any (array[
      'CCMA0608',
      'CCMA0810',
      'CCMA1012',
      'CCMA1215',
      'CCMA1520',
      'CCMA2530',
      'CCMA4050'
    ]::text[]);

  if v_target_package_count <> 7 then
    raise exception 'Expected 7 active 2026 Mid-Autumn packages, found %',
      v_target_package_count;
  end if;

  select count(*)
  into v_choice_sets_to_restore
  from public.package_choice_sets choice_set
  where choice_set.package_id is null
    and choice_set.package_legacy_id = any (v_target_package_legacy_ids);

  select count(*)
  into v_grouped_members_to_restore
  from public.package_products member
  where member.package_id is null
    and member.package_legacy_id = any (v_target_package_legacy_ids)
    and member.package_choice_set_legacy_id is not null
    and exists (
      select 1
      from public.package_choice_sets choice_set
      where choice_set.package_legacy_id = member.package_legacy_id
        and choice_set.legacy_id = member.package_choice_set_legacy_id
    );

  select count(*)
  into v_ungrouped_members_to_detach
  from public.package_products member
  where member.package_id = any (v_target_package_ids)
    and (
      member.package_choice_set_legacy_id is null
      or not exists (
        select 1
        from public.package_choice_sets choice_set
        where choice_set.package_id = member.package_id
          and choice_set.legacy_id = member.package_choice_set_legacy_id
      )
    );

  if not (
    (v_choice_sets_to_restore = 42 and v_grouped_members_to_restore = 132)
    or (v_choice_sets_to_restore = 0 and v_grouped_members_to_restore = 0)
  ) then
    raise exception
      'Expected 42 choice sets and 132 grouped members to restore (or zero), found % and %',
      v_choice_sets_to_restore,
      v_grouped_members_to_restore;
  end if;

  if v_ungrouped_members_to_detach not in (0, 220) then
    raise exception 'Expected 220 ungrouped members to detach (or zero), found %',
      v_ungrouped_members_to_detach;
  end if;

  update public.package_choice_sets choice_set
  set package_id = pkg.id
  from public.packages pkg
  where choice_set.package_id is null
    and choice_set.package_legacy_id = pkg.legacy_id
    and pkg.id = any (v_target_package_ids);

  update public.package_products member
  set package_id = pkg.id,
      updated_at = now()
  from public.packages pkg
  where member.package_id is null
    and member.package_legacy_id = pkg.legacy_id
    and pkg.id = any (v_target_package_ids)
    and member.package_choice_set_legacy_id is not null
    and exists (
      select 1
      from public.package_choice_sets choice_set
      where choice_set.package_id = pkg.id
        and choice_set.legacy_id = member.package_choice_set_legacy_id
    );

  update public.package_products member
  set package_id = null,
      updated_at = now()
  where member.package_id = any (v_target_package_ids)
    and (
      member.package_choice_set_legacy_id is null
      or not exists (
        select 1
        from public.package_choice_sets choice_set
        where choice_set.package_id = member.package_id
          and choice_set.legacy_id = member.package_choice_set_legacy_id
      )
    );

  select count(*)
  into v_remaining_member_count
  from public.package_products member
  where member.package_id = any (v_target_package_ids);

  select count(*)
  into v_remaining_choice_set_count
  from public.package_choice_sets choice_set
  where choice_set.package_id = any (v_target_package_ids);

  select count(*)
  into v_remaining_ungrouped_count
  from public.package_products member
  where member.package_id = any (v_target_package_ids)
    and (
      member.package_choice_set_legacy_id is null
      or not exists (
        select 1
        from public.package_choice_sets choice_set
        where choice_set.package_id = member.package_id
          and choice_set.legacy_id = member.package_choice_set_legacy_id
      )
    );

  if v_remaining_member_count <> 254 then
    raise exception 'Expected 254 categorized package members after cleanup, found %',
      v_remaining_member_count;
  end if;

  if v_remaining_choice_set_count <> 71 then
    raise exception 'Expected 71 active package choice sets after cleanup, found %',
      v_remaining_choice_set_count;
  end if;

  if v_remaining_ungrouped_count <> 0 then
    raise exception 'Expected zero ungrouped members after cleanup, found %',
      v_remaining_ungrouped_count;
  end if;
end
$$;
