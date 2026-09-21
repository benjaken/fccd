-- FCCD 真人對話學習第一期（T02）：案例主表與向量表。
--
-- 案例只作「怎樣講、先問甚麼」的應對參考（response_guidance），永不充當業務
-- 事實或政策依據。狀態轉移與首期不變條件由資料庫守衛保證，呼叫者（模型或
-- 前端）不能自行把 draft 變成 active，也不能把案例用作 grounding。
begin;
set local search_path = public, extensions, pg_temp;

create table if not exists public.customer_service_cases (
  id uuid primary key default gen_random_uuid(),
  revision bigint not null default 1,
  title text not null check (length(btrim(title)) > 0),
  kind text not null default 'conversation_case'
    check (kind in ('conversation_case')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  allowed_use text not null default 'response_guidance'
    check (allowed_use in ('response_guidance')),
  provenance text not null default 'learned_human'
    check (provenance in ('manual', 'learned_human', 'learned_bot')),
  scenario_context text not null check (length(btrim(scenario_context)) > 0),
  known_information jsonb not null default '{}'::jsonb
    check (jsonb_typeof(known_information) = 'object'),
  missing_information text[] not null default '{}',
  conversation_excerpt jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conversation_excerpt) = 'array'),
  response_strategy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(response_strategy) = 'object'),
  applicability jsonb not null default '{}'::jsonb
    check (jsonb_typeof(applicability) = 'object'),
  environment text not null check (length(btrim(environment)) > 0),
  source_message_ids text[] not null default '{}',
  source_fingerprint text not null check (length(btrim(source_fingerprint)) > 0),
  outcome text not null default 'unknown'
    check (outcome in ('unknown', 'positive', 'negative')),
  outcome_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(outcome_evidence) = 'object'),
  content_hash text,
  is_synthetic boolean not null default false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  retired_at timestamptz,
  retired_reason text,
  embedding_revision bigint not null default 1,
  embedding_status text not null default 'pending'
    check (embedding_status in ('pending', 'ready', 'failed', 'stale')),
  embedding_profile text,
  embedding_claim_token uuid,
  embedding_claim_until timestamptz,
  embedding_target_profile text,
  embedding_retry_at timestamptz,
  embedding_attempts integer not null default 0,
  embedding_error text,
  embedding_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, source_fingerprint)
);

create index if not exists customer_service_cases_active_idx
  on public.customer_service_cases (environment, status)
  where status = 'active';
create index if not exists customer_service_cases_work_idx
  on public.customer_service_cases (embedding_retry_at, embedding_attempts, id);

create table if not exists public.customer_service_case_embeddings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.customer_service_cases(id) on delete cascade,
  case_revision bigint not null,
  embedding vector(1024) not null,
  model text not null,
  profile text not null,
  content_hash text not null,
  content_version text not null default 'case-guidance-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, model, case_revision)
);

create index if not exists customer_service_case_embeddings_case_idx
  on public.customer_service_case_embeddings (case_id);

-- 只有 service_role（經管理命令）可讀寫；匿名與一般客戶完全隔離。
alter table public.customer_service_cases enable row level security;
alter table public.customer_service_case_embeddings enable row level security;
revoke all on table public.customer_service_cases from public, anon, authenticated;
revoke all on table public.customer_service_case_embeddings from public, anon, authenticated;
grant all on table public.customer_service_cases to service_role;
grant all on table public.customer_service_case_embeddings to service_role;

-- 新增／內容變更時遞增 revision 並重設 embedding；active 內容被編輯即降回
-- draft 並清除審核記錄（規格 05：編輯 active 先降 draft，再升版重審）。
create or replace function public.customer_service_cases_before_write()
returns trigger language plpgsql
set search_path = pg_catalog, public, extensions, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  if TG_OP = 'INSERT' then
    new.revision := 1;
    new.embedding_revision := 1;
    new.embedding_status := 'pending';
    new.content_hash := null;
    if new.status <> 'draft' then
      raise exception 'customer_service_case_must_start_draft' using errcode = '22023';
    end if;
  elsif new.title is distinct from old.title
     or new.scenario_context is distinct from old.scenario_context
     or new.known_information is distinct from old.known_information
     or new.missing_information is distinct from old.missing_information
     or new.conversation_excerpt is distinct from old.conversation_excerpt
     or new.response_strategy is distinct from old.response_strategy
     or new.applicability is distinct from old.applicability
     or new.environment is distinct from old.environment then
    new.revision := old.revision + 1;
    new.embedding_revision := old.embedding_revision + 1;
    new.embedding_status := 'pending';
    new.content_hash := null;
    new.embedding_profile := null;
    new.embedding_updated_at := null;
    new.embedding_claim_token := null;
    new.embedding_claim_until := null;
    new.embedding_target_profile := null;
    new.embedding_retry_at := null;
    new.embedding_attempts := 0;
    new.embedding_error := null;
    if old.status = 'active' then
      new.status := 'draft';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;

  -- 首期不變條件：合成資料不可入 production；learned_bot 不可啟用。
  if new.is_synthetic and new.environment = 'production' then
    raise exception 'customer_service_case_synthetic_production_forbidden' using errcode = '22023';
  end if;
  if new.provenance = 'learned_bot' and new.status = 'active' then
    raise exception 'customer_service_case_learned_bot_not_active' using errcode = '22023';
  end if;

  -- 狀態轉移守衛。
  if TG_OP = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'retired' and new.status = 'draft' then
      new.retired_at := null;
      new.retired_reason := null;
    elsif new.status = 'active' then
      if old.status <> 'draft' then
        raise exception 'customer_service_case_invalid_transition' using errcode = '22023';
      end if;
      if new.embedding_status <> 'ready'
         or new.embedding_revision <> new.revision
         or new.content_hash is null
         or new.reviewed_by is null then
        raise exception 'customer_service_case_not_ready_to_activate' using errcode = '22023';
      end if;
      new.reviewed_at := coalesce(new.reviewed_at, clock_timestamp());
    elsif new.status = 'retired' then
      new.retired_at := coalesce(new.retired_at, clock_timestamp());
    else
      raise exception 'customer_service_case_invalid_transition' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_service_cases_before_write on public.customer_service_cases;
create trigger customer_service_cases_before_write
before insert or update on public.customer_service_cases
for each row execute function public.customer_service_cases_before_write();

revoke all on function public.customer_service_cases_before_write() from public, anon, authenticated;

commit;
