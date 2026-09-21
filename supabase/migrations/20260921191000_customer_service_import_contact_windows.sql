-- FCCD 客服歷史匯入：聯絡人增量快取改為記錄「已覆蓋嘅窗口」。
--
-- 問題：
--   customer_service_learning_import_contacts.last_checked_at 記錄嘅係
--   「檢查時間」而唔係「已匯入嘅窗口終點」。匯入較新窗口後（例如 9 月），
--   全部電話嘅 last_checked_at 會變成當下時間；之後再匯入較舊窗口
--   （例如 7/1–7/31，until=7/31）時，last_checked_at >= until 成立，
--   全部電話被誤判為「已檢查」而跳過，導致 0 匯入。
--
-- 修正：
--   新增 checked_since / checked_until，記錄每個電話實際已匯入嘅窗口。
--   只有當已記錄窗口完全覆蓋請求窗口時，才會跳過。
--
-- 舊資料嘅 checked_since/checked_until 為 null，因此唔會再誤跳過，
-- 需要重新匯入時會正常去拉。
begin;
set local search_path = public, extensions, pg_temp;

alter table public.customer_service_learning_import_contacts
  add column if not exists checked_since timestamptz,
  add column if not exists checked_until timestamptz;

create index if not exists customer_service_learning_import_contacts_window_idx
  on public.customer_service_learning_import_contacts (environment, checked_until);

commit;
