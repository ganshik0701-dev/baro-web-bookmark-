-- 003_rls.sql
-- 5개 테이블에 RLS(행 수준 보안)를 켜고, 로그인한 사용자가 자기 행만 다루게 하는 정책을 만든다.
-- 조건은 user_id = auth.uid() (profiles만 id = auth.uid()). docs/02-db.md 기준.
--
-- 읽는 법
--   USING      : 이미 있는 행 중 "어떤 행을 보고/고치고/지울 수 있나" (SELECT·UPDATE·DELETE)
--   WITH CHECK : 새로 쓰는 행이 "이 값으로 저장돼도 되나" (INSERT·UPDATE)
--   UPDATE는 둘 다 쓴다. USING으로 남의 행을 못 고르게 하고,
--   WITH CHECK로 내 행의 user_id를 남의 것으로 바꿔 넘기지 못하게 한다.
--
-- 공통 규칙
--   - to authenticated: 로그인하지 않은 anon 역할에는 정책이 하나도 없으므로 전부 거부된다.
--   - auth.uid()를 (select auth.uid())로 감싼다. 행마다 함수를 다시 부르지 않고
--     쿼리당 한 번만 계산하게 하는 Supabase 권장 방식이다. 결과는 같다.
--   - 서비스 키(service_role)는 RLS를 건너뛴다. 그래서 API가 서비스 키로 쿼리할 때는
--     user_id 조건을 코드에서 직접 붙여야 한다 (CLAUDE.md 'API 보안').

alter table public.profiles   enable row level security;
alter table public.groups     enable row level security;
alter table public.bookmarks  enable row level security;
alter table public.visit_logs enable row level security;
alter table public.api_tokens enable row level security;

-- ─── profiles ─────────────────────────────────────────────
-- profiles는 user_id 컬럼 없이 id 자체가 auth.users.id라서 id로 비교한다.

-- 내 설정만 읽는다
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- 평소에는 트리거(on_auth_user_created)가 만들지만, 직접 넣더라도 내 id로만 가능
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- 내 설정만 고르고(USING), 고친 뒤에도 id가 내 것이어야 한다(WITH CHECK)
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 내 행만 지운다. 지우면 FK의 on delete cascade로 그룹·북마크·토큰도 함께 지워진다
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using (id = (select auth.uid()));

-- ─── groups ───────────────────────────────────────────────

-- 내 그룹만 보인다
create policy "groups_select_own" on public.groups
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 남의 user_id로 그룹을 만들어 끼워 넣지 못하게 한다
create policy "groups_insert_own" on public.groups
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 내 그룹만 고르고, 고친 뒤에도 주인이 나여야 한다 (user_id 바꿔치기 방지)
create policy "groups_update_own" on public.groups
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 내 그룹만 지운다. 속한 북마크는 group_id가 NULL(미분류)이 된다
create policy "groups_delete_own" on public.groups
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── bookmarks ────────────────────────────────────────────

-- 내 북마크만 보인다
create policy "bookmarks_select_own" on public.bookmarks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 남의 이름으로 북마크를 넣지 못하게 한다
create policy "bookmarks_insert_own" on public.bookmarks
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 내 북마크만 고르고, 고친 뒤에도 주인이 나여야 한다
create policy "bookmarks_update_own" on public.bookmarks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 내 북마크만 지운다. 방문 기록은 FK cascade로 함께 지워진다
create policy "bookmarks_delete_own" on public.bookmarks
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── visit_logs ───────────────────────────────────────────
-- 정상 경로의 기록은 record_visit 함수(security definer)가 넣는다.
-- 정책은 직접 쿼리가 들어와도 자기 행 밖으로 나가지 못하게 막는 역할이다.

-- 내 방문 기록만 보인다 (30일 집계도 이 범위 안에서만 된다)
create policy "visit_logs_select_own" on public.visit_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 남의 user_id로 기록을 넣어 남의 방문 수를 부풀리지 못하게 한다
create policy "visit_logs_insert_own" on public.visit_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 내 기록만 고르고, 고친 뒤에도 주인이 나여야 한다
create policy "visit_logs_update_own" on public.visit_logs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 내 기록만 지운다
create policy "visit_logs_delete_own" on public.visit_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── api_tokens ───────────────────────────────────────────
-- token_hash는 행에 들어 있지만, 응답에서 빼는 것은 API의 몫이다 (docs/03-api.md)

-- 내 토큰 목록만 보인다
create policy "api_tokens_select_own" on public.api_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 내 이름으로만 토큰을 발급한다
create policy "api_tokens_insert_own" on public.api_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 내 토큰만 고르고(이름 변경·last_used_at 갱신), 주인을 바꾸지 못한다
create policy "api_tokens_update_own" on public.api_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 내 토큰만 폐기한다
create policy "api_tokens_delete_own" on public.api_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));
