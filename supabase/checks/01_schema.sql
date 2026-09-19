-- 01_schema.sql
-- 마이그레이션 001~004가 제대로 적용됐는지 한 번에 확인한다. (읽기만 하고 아무것도 바꾸지 않는다)
-- Supabase SQL 에디터에 통째로 붙여 넣고 Run.
-- 볼 것: 결과 표의 '통과' 열이 전부 true인지. false인 줄의 '파일'이 다시 적용할 마이그레이션이다.
-- 일부만 적용된 상태에서도 에러 없이 끝나도록, 없는 객체는 to_regclass·to_regprocedure로 NULL 처리한다.

with
t as (  -- 테이블 5개와 RLS 켜짐 여부
  select c.relname, c.relrowsecurity
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind = 'r'
     and c.relname in ('profiles', 'groups', 'bookmarks', 'visit_logs', 'api_tokens')
),
i as (  -- docs/02-db.md 인덱스 표의 10개
  select indexname
    from pg_indexes
   where schemaname = 'public'
     and indexname in ('idx_bm_user_created', 'idx_bm_user_visited', 'idx_bm_user_position',
                       'idx_bm_user_chrome', 'uq_bm_user_url', 'idx_bm_tags',
                       'idx_visit_recent', 'idx_visit_cleanup', 'idx_groups_user', 'idx_tokens_hash')
),
p as (  -- RLS 정책 (테이블 5개 × SELECT/INSERT/UPDATE/DELETE)
  select tablename, cmd from pg_policies where schemaname = 'public'
),
tg as (  -- 트리거
  select tgname, tgrelid::regclass::text as tbl
    from pg_trigger
   where not tgisinternal
     and tgname in ('on_auth_user_created', 'set_updated_at')
),
rv as (  -- record_visit 함수 (없으면 NULL)
  select to_regprocedure('public.record_visit(uuid)') as oid
),
r as (
            select 1 as 순서, '001' as 파일, '테이블 5개' as 항목, '5' as 기대,
                   (select count(*) from t)::text as 실제
  union all select 2, '001', '001 안의 인덱스 3개 (uq_bm_user_url, idx_bm_user_chrome, idx_tokens_hash)', '3',
                   (select count(*) from i
                     where indexname in ('uq_bm_user_url', 'idx_bm_user_chrome', 'idx_tokens_hash'))::text
  union all select 3, '001', 'bookmarks URL CHECK 제약', '1',
                   (select count(*) from pg_constraint
                     where conname = 'bookmarks_url_check'
                       and conrelid = to_regclass('public.bookmarks'))::text
  union all select 4, '002', '002의 인덱스 7개', '7',
                   (select count(*) from i
                     where indexname not in ('uq_bm_user_url', 'idx_bm_user_chrome', 'idx_tokens_hash'))::text
  union all select 5, '001+002', '인덱스 합계 (문서 이름 기준)', '10',
                   (select count(*) from i)::text
  union all select 6, '003', 'RLS 켜진 테이블', '5',
                   (select count(*) from t where relrowsecurity)::text
  union all select 7, '003', 'RLS 정책 수', '20',
                   (select count(*) from p)::text
  union all select 8, '003', '정책이 4개가 아닌 테이블', '(없음)',
                   coalesce((select string_agg(x.relname || '=' || x.n, ', ')
                               from (select t.relname, count(p.cmd) n
                                       from t left join p on p.tablename = t.relname
                                      group by 1) x
                              where x.n <> 4), '(없음)')
  union all select 9, '004', '트리거 on_auth_user_created (auth.users)', '1',
                   (select count(*) from tg where tgname = 'on_auth_user_created' and tbl = 'auth.users')::text
  union all select 10, '004', '트리거 set_updated_at (profiles, groups, bookmarks)', '3',
                   (select count(*) from tg where tgname = 'set_updated_at')::text
  union all select 11, '004', '함수 record_visit(uuid)', 'true',
                   (select oid is not null from rv)::text
  union all select 12, '004', 'record_visit가 SECURITY DEFINER', 'true',
                   coalesce((select prosecdef from pg_proc where oid = (select oid from rv)), false)::text
  union all select 13, '004', 'authenticated가 record_visit 실행 가능', 'true',
                   coalesce((select has_function_privilege('authenticated', oid, 'execute') from rv), false)::text
  union all select 14, '004', 'anon은 record_visit 실행 불가', 'false',
                   coalesce((select has_function_privilege('anon', oid, 'execute') from rv), true)::text
  union all select 15, '(권한)', 'authenticated가 bookmarks에 SELECT 권한 보유', 'true',
                   coalesce(has_table_privilege('authenticated', to_regclass('public.bookmarks'), 'select'), false)::text
)
select 순서, 파일, 항목, 기대, 실제, 기대 = 실제 as 통과
  from r
 order by 순서;

-- 더 자세히 보고 싶을 때 (위 쿼리를 지우고 하나씩 실행)
-- select tablename, policyname, cmd, qual as using_식, with_check as with_check_식
--   from pg_policies where schemaname = 'public' order by tablename, cmd;
-- select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2;
