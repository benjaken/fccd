begin;

-- Improve FAQ retrieval across the complete published corpus and clean stale
-- internal/customer-facing knowledge. The model receives only ranked matches.

delete from public.customer_faqs
where locale = 'zh-HK'
  and question = 'HSBC2024 優惠碼仲用唔用得？';

update public.customer_faqs
set
  question = '銀行轉帳資料可以自動回覆嗎？',
  answer = '內部安全備註：銀行、PayMe 及八達通付款資料可能更新，不應由 FAQ Bot 自動公開；需要轉人工確認。',
  keywords = '銀行轉帳,付款資料,payme,八達通,敏感資料',
  updated_at = now()
where locale = 'zh-HK'
  and question = '銀行轉帳戶口係幾號？'
  and not is_published;

update public.customer_faqs
set
  keywords = '收據,發票,invoice,receipt,單據,自助下載',
  updated_at = now()
where locale = 'zh-HK'
  and question = '點攞收據或者發票？';

update public.customer_faqs
set keywords = case question
  when '可唔可以荃灣自取？' then '荃灣,自取,pickup,工場,自己攞,自己去攞,取餐'
  when '運費幾多？' then '運費,送貨費,shipping,delivery fee,免運,2800,express 200,送唔送,送到,配送'
  when '有冇早餐？' then '早餐,breakfast,最早,上午,朝早,早餐食'
  when '接受咩付款方式？' then '付款,信用卡,支付寶,微信支付,轉數快,payment,俾錢,點俾錢,支付方式'
  when '點樣喺網站落單？' then '落單,網站,網上訂,點樣訂,how to order,買嘢,訂嘢'
  else keywords
end,
updated_at = now()
where locale = 'zh-HK'
  and question in (
    '可唔可以荃灣自取？',
    '運費幾多？',
    '有冇早餐？',
    '接受咩付款方式？',
    '點樣喺網站落單？'
  );

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
  v_normalized text := regexp_replace(lower(btrim(coalesce(p_query, ''))), '[[:space:]?？!！,，。:：;；]', '', 'g');
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
        when regexp_replace(lower(faq.question), '[[:space:]?？!！,，。:：;；]', '', 'g') = v_normalized then 10.0
        else 0.0
      end
      + case when faq.question ilike '%' || v_query || '%' then 5.0 else 0.0 end
      + case when v_query ilike '%' || regexp_replace(faq.question, '[?？]', '', 'g') || '%' then 4.0 else 0.0 end
      + case when keyword_match.matched then 6.0 else 0.0 end
      + case when faq.answer ilike '%' || v_query || '%' then 2.0 else 0.0 end
      + greatest(
          similarity(faq.question, v_query),
          similarity(faq.keywords, v_query),
          similarity(faq.answer, v_query)
        ) * 3.0 as rank_score
    from public.customer_faqs faq
    cross join lateral (
      select coalesce(bool_or(
        length(term.value) >= 2
        and v_normalized like '%' || regexp_replace(lower(term.value), '[[:space:]]', '', 'g') || '%'
      ), false) as matched
      from regexp_split_to_table(coalesce(faq.keywords, ''), '[,，、;；]+') as term(value)
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
