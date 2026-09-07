-- Correct the 2026 CCMA0810 package to its seven intended choice sets.
-- Five legacy-only sets and two legacy cold-platter members are detached so
-- historical order references remain valid.
do $$
declare
  v_package_id uuid;
  v_choice_set_count integer;
  v_member_count integer;
  v_selected_count integer;
  v_ungrouped_count integer;
  v_choice_shape_count integer;
begin
  select pkg.id
  into strict v_package_id
  from public.packages pkg
  where pkg.archived_at is null
    and pkg.sku = 'CCMA0810';

  select count(*) into v_choice_set_count
  from public.package_choice_sets
  where package_id = v_package_id;

  select count(*) into v_member_count
  from public.package_products
  where package_id = v_package_id;

  if not (
    (v_choice_set_count = 12 and v_member_count = 36)
    or (v_choice_set_count = 7 and v_member_count = 18)
  ) then
    raise exception
      'Expected CCMA0810 in pre-fix state 12/36 or fixed state 7/18, found %/%',
      v_choice_set_count,
      v_member_count;
  end if;

  update public.package_products member
  set package_id = null,
      updated_at = now()
  where member.package_id = v_package_id
    and (
      member.package_choice_set_legacy_id not in (
        '1757491073962x175340264526708740',
        '1786952897043x878612126084628500',
        '1786952939798x595541223052935200',
        '1786952998066x741705423332311000',
        '1786953029751x835067616771440600',
        '1786953056241x366515164852518900',
        '1786953083786x521521019162460160'
      )
      or member.legacy_id in (
        '1757491133799x331417233653497860',
        '1757491137477x407897852017901600'
      )
    );

  update public.package_choice_sets choice_set
  set package_id = null
  where choice_set.package_id = v_package_id
    and choice_set.legacy_id not in (
      '1757491073962x175340264526708740',
      '1786952897043x878612126084628500',
      '1786952939798x595541223052935200',
      '1786952998066x741705423332311000',
      '1786953029751x835067616771440600',
      '1786953056241x366515164852518900',
      '1786953083786x521521019162460160'
    );

  update public.package_choice_sets
  set choice_type = case legacy_id
    when '1786952897043x878612126084628500' then '中式小菜 3選1'
    when '1786952939798x595541223052935200' then '中式小菜 4選2'
    when '1786952998066x741705423332311000' then '中式小菜 2選1'
    else choice_type
  end
  where package_id = v_package_id;

  update public.package_products member
  set is_selected = member.legacy_id in (
        '1786952832875x725254966659252200',
        '1786952905002x816841261764837400',
        '1786952947498x958665098580197400',
        '1786952955852x460072829778919400',
        '1786953010746x849204485103550500',
        '1786953044601x438155967921389600',
        '1786953065271x469683986181128200',
        '1786953109601x979010887548928000'
      ),
      updated_at = now()
  where member.package_id = v_package_id;

  select count(*) into v_choice_set_count
  from public.package_choice_sets
  where package_id = v_package_id;

  select count(*), count(*) filter (where is_selected)
  into v_member_count, v_selected_count
  from public.package_products
  where package_id = v_package_id;

  select count(*) into v_ungrouped_count
  from public.package_products member
  where member.package_id = v_package_id
    and (
      member.package_choice_set_legacy_id is null
      or not exists (
        select 1
        from public.package_choice_sets choice_set
        where choice_set.package_id = v_package_id
          and choice_set.legacy_id = member.package_choice_set_legacy_id
      )
    );

  select count(*) into v_choice_shape_count
  from (
    values
      ('1757491073962x175340264526708740', '冷盤 2選1', 1, 2, 1),
      ('1786952897043x878612126084628500', '中式小菜 3選1', 1, 3, 1),
      ('1786952939798x595541223052935200', '中式小菜 4選2', 2, 4, 2),
      ('1786952998066x741705423332311000', '中式小菜 2選1', 1, 2, 1),
      ('1786953029751x835067616771440600', '鍋物 2選1', 1, 2, 1),
      ('1786953056241x366515164852518900', '粉麵飯 2選1', 1, 2, 1),
      ('1786953083786x521521019162460160', '甜品 3選1', 1, 3, 1)
  ) expected(legacy_id, choice_type, maximum_choices, member_count, selected_count)
  join public.package_choice_sets choice_set
    on choice_set.package_id = v_package_id
   and choice_set.legacy_id = expected.legacy_id
   and choice_set.choice_type = expected.choice_type
   and choice_set.maximum_choices = expected.maximum_choices
  where (
    select count(*)
    from public.package_products member
    where member.package_id = v_package_id
      and member.package_choice_set_legacy_id = expected.legacy_id
  ) = expected.member_count
    and (
      select count(*)
      from public.package_products member
      where member.package_id = v_package_id
        and member.package_choice_set_legacy_id = expected.legacy_id
        and member.is_selected
    ) = expected.selected_count;

  if v_choice_set_count <> 7
     or v_member_count <> 18
     or v_selected_count <> 8
     or v_ungrouped_count <> 0
     or v_choice_shape_count <> 7 then
    raise exception
      'CCMA0810 verification failed: sets %, members %, selected %, ungrouped %, valid shapes %',
      v_choice_set_count,
      v_member_count,
      v_selected_count,
      v_ungrouped_count,
      v_choice_shape_count;
  end if;
end
$$;
