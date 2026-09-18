-- STAGING ONLY. Run as the database owner after the two new migrations.
-- No external model calls. All inserted fixtures/updates are rolled back.
-- Not executed by the patch application script, and not executed in the delivery environment.
begin;
set local search_path=public,extensions,pg_temp;
do $$
declare
 faq_id uuid; claim record; refreshed record; profile_id text:=repeat('a',64);
 vec text:='['||array_to_string(array_fill(0.01::double precision,array[1024]),',')||']';
 hits integer; ok boolean;
begin
 insert into public.customer_faqs(category,question,answer,keywords,locale,is_published,sort_order)
 values('payment','__RAG_SMOKE__退款流程','一般 7 個工作天。','退款','zh-HK',true,0) returning id into faq_id;
 select * into strict claim from public.customer_service_claim_faq_embeddings(profile_id,1,array[faq_id],true);
 if claim.revision<>1 then raise exception 'initial_revision_failed'; end if;
 ok:=public.customer_service_complete_faq_embedding(faq_id,claim.revision,claim.claim_token,vec,'smoke-model',profile_id,'hash1');
 if not ok then raise exception 'complete_failed'; end if;
 select count(*) into hits from public.search_published_customer_faqs_by_vector_v2(vec,'smoke-model',profile_id,5,0.1) r where r.id=faq_id;
 if hits<>1 then raise exception 'ready_retrieval_failed'; end if;
 select count(*) into hits from public.search_published_customer_faqs_by_vector_v2(vec,'wrong-model',profile_id,5,0.1) r where r.id=faq_id;
 if hits<>0 then raise exception 'model_isolation_failed'; end if;
 select count(*) into hits from public.search_published_customer_faqs_by_vector(vec,5,0.1);
 if hits<>0 then raise exception 'legacy_query_must_fail_closed'; end if;
 update public.customer_faqs set question='__RAG_SMOKE__修改後退款流程' where id=faq_id;
 select count(*) into hits from public.search_published_customer_faqs_by_vector_v2(vec,'smoke-model',profile_id,5,0.1) r where r.id=faq_id;
 if hits<>0 then raise exception 'pending_retrieval_failed'; end if;
 ok:=public.customer_service_complete_faq_embedding(faq_id,claim.revision,claim.claim_token,vec,'smoke-model',profile_id,'hash-old');
 if ok then raise exception 'old_claim_wrote_ready'; end if;
 select * into strict refreshed from public.customer_service_claim_faq_embeddings(profile_id,1,array[faq_id],false);
 insert into public.customer_faq_aliases(faq_id,alias_type,alias_text) values(faq_id,'similar','__RAG_SMOKE__點樣退錢');
 ok:=public.customer_service_complete_faq_embedding(faq_id,refreshed.revision,refreshed.claim_token,vec,'smoke-model',profile_id,'hash-old-alias');
 if ok then raise exception 'alias_change_did_not_invalidate_claim'; end if;
 select * into strict refreshed from public.customer_service_claim_faq_embeddings(profile_id,1,array[faq_id],false);
 if cardinality(refreshed.aliases)<>1 then raise exception 'alias_snapshot_failed'; end if;
 ok:=public.customer_service_complete_faq_embedding(faq_id,refreshed.revision,gen_random_uuid(),vec,'smoke-model',profile_id,'wrong-token');
 if ok then raise exception 'wrong_claim_token_accepted'; end if;
 ok:=public.customer_service_complete_faq_embedding(faq_id,refreshed.revision,refreshed.claim_token,vec,'smoke-model',profile_id,'hash2');
 if not ok then raise exception 'fresh_completion_failed'; end if;
 if has_table_privilege('service_role','public.customer_faq_embeddings','INSERT') then raise exception 'direct_embedding_write_still_allowed'; end if;
 raise notice 'RAG consistency smoke passed (transaction will roll back).';
end;
$$;
rollback;
