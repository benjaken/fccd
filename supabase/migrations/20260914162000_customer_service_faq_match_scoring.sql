begin;

-- A single generic keyword (for example "付款" or "送貨") may retrieve a
-- candidate, but must not outrank a phrase-level or multi-keyword match. The
-- application applies the final allow-list/exclusion rules before answering.
create or replace function public.search_published_customer_faqs(
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  category text,
  question text,
  answer text,
  score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_normalized text := regexp_replace(
    lower(btrim(coalesce(p_query, ''))),
    '[[:space:]?？!！,，。:：;；、]',
    '',
    'g'
  );
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
begin
  if v_normalized = '' then
    return;
  end if;

  return query
  with ranked as (
    select
      faq.id,
      faq.category,
      faq.question,
      faq.answer,
      case
        when regexp_replace(
          lower(faq.question),
          '[[:space:]?？!！,，。:：;；、]',
          '',
          'g'
        ) = v_normalized then 10.0
        else 0.0
      end
      + case when faq.question ilike '%' || v_query || '%' then 5.0 else 0.0 end
      + case when v_query ilike '%' || regexp_replace(faq.question, '[?？]', '', 'g') || '%' then 4.0 else 0.0 end
      + case
          when keyword_match.matched_count >= 2 then 6.0
          when keyword_match.longest_match >= 4 then 4.0
          when keyword_match.matched_count = 1 then 0.25
          else 0.0
        end
      + case when faq.answer ilike '%' || v_query || '%' then 2.0 else 0.0 end
      + greatest(
          similarity(faq.question, v_query),
          similarity(faq.keywords, v_query),
          similarity(faq.answer, v_query)
        ) * 3.0 as rank_score
    from public.customer_faqs faq
    cross join lateral (
      select
        count(*) filter (
          where length(keyword.normalized) >= 2
            and v_normalized like '%' || keyword.normalized || '%'
        )::integer as matched_count,
        coalesce(max(length(keyword.normalized)) filter (
          where length(keyword.normalized) >= 2
            and v_normalized like '%' || keyword.normalized || '%'
        ), 0)::integer as longest_match
      from (
        select regexp_replace(
          lower(btrim(term.value)),
          '[[:space:]?？!！,，。:：;；、]',
          '',
          'g'
        ) as normalized
        from regexp_split_to_table(
          coalesce(faq.keywords, ''),
          '[,，、;；]+'
        ) as term(value)
      ) keyword
    ) keyword_match
    where faq.is_published
  )
  select ranked.id, ranked.category, ranked.question, ranked.answer, ranked.rank_score::numeric
  from ranked
  where ranked.rank_score >= 0.50
  order by ranked.rank_score desc, ranked.question
  limit v_limit;
end;
$$;

revoke all on function public.search_published_customer_faqs(text, integer) from public, anon;
grant execute on function public.search_published_customer_faqs(text, integer) to authenticated, service_role;

commit;
